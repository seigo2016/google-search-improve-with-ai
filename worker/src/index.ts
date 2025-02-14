import * as htmlparser2 from "htmlparser2";
import { createWorkersAI } from 'workers-ai-provider';
import { generateObject } from 'ai';
import { z } from 'zod';

export default {
  async fetch(request: Request, env: Env) {
		async function generateObjectWithRetry(params: any, retries = 3) {
			for (let i = 0; i < retries; i++) {
				try {
					return await generateObject(params);
				} catch (error) {
					if (i === retries - 1) {
						throw error;
					}
				}
			}
		}

    const url = new URL(request.url);
		if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }
		// access tokenの確認
		const accessToken = request.headers.get('Authorization')
		if (!accessToken) {
			return new Response('No access token provided', {status: 401})
		}
		if (accessToken !== env.AUTH_KEY) {
			return new Response('Invalid access token', {status: 403})
		}

		if (url.pathname === '/generate-questions') {
			const keywords = url.searchParams.get('keywords')?.split(' ')
			if (!keywords) {
				return new Response('No keywords provided', {status: 400})
			}
			const prompt = [
				{
					role: "system",
					content: `ユーザーは以下のキーワードで情報を探しています:
					${keywords.map(keyword => `- ${keyword}`).join('\n')}
        	上記に関して、ユーザーが本当に知りたいと思われる質問を3つ、簡潔に提案してください。
      	`
				}
			]
			const workersai = createWorkersAI({binding: env.AI})
			const result = await generateObjectWithRetry({
				model: workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
				prompt: prompt[0].content,
				schema: z.object({
					questions: z.array(z.string())
				})
			})

			if (result === undefined) {
				return new Response('Failed to generate questions', {status: 500})
			}

			return new Response(JSON.stringify(result.object), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				},
			});	
		} else if (url.pathname === '/evaluate-pages') {
			// request bodyからURLの配列を取得
			const req = await request.json() as {
				urls: string[]
				original_keywords: string
				suggested_questions: string[]
			}

			// URLの配列からページの内容を取得
			const pages = await Promise.all(req.urls.map(async (url) => {
				const response = await fetch(url)
				if (!response.ok || response.body === null) {
					throw new Error(`Failed to fetch ${url}`)
				}
				const bodyRaw = await response.text();
				const document = htmlparser2.parseDocument(bodyRaw);
				// タグやスクリプトを削除
				htmlparser2.DomUtils.findAll(elem => elem.tagName === 'script', document.childNodes).forEach(elem => htmlparser2.DomUtils.removeElement(elem));
				htmlparser2.DomUtils.findAll(elem => elem.tagName === 'style', document.childNodes).forEach(elem => htmlparser2.DomUtils.removeElement(elem));
				
				const bodyText = htmlparser2.DomUtils.textContent(document);
				return {
					body: bodyText,
					url: url
				}
			}))

			// ページの要約を取得
			const pageSummaries = await Promise.all(pages.map(async (page) => {
				const summary = await env.AI.run(
					'@cf/facebook/bart-large-cnn', {
						input_text: page.body,
						max_length: 100,
					},
				)
				return {
					url: page.url,
					summary: summary
				}
			}))
			console.log(pageSummaries.length)
			
			const workersai = createWorkersAI({binding: env.AI})
			// 評価を取得
			const evaluations = await Promise.all(pageSummaries.map(async (page) => {
				
				// キーワードをmdのリストにする
				const prompt = `
					## 元の検索ワード
					${req.original_keywords.split(' ').map(keyword => `- ${keyword}`).join('\n')}

					## ユーザーが知りたいと思われる質問
					${req.suggested_questions.map(question => `- ${question}`).join('\n')}

					## ページのURL
					${page.url}

					## ページの内容
					${page.summary.summary}

					このページは上記の質問に対してどの程度適切な回答や情報を含んでいますか？
					以下の評価軸を下に**0から10の範囲**でスコアをつけてください。それぞれの評価軸のスコアと総合評価、全体的な理由も簡潔に記述してください。

					## 評価軸
					重要な評価軸は優先順位順に以下の通りです:
					- 信頼性 (公式docs / 学術論文 / 信頼できる情報源からの引用)
					- 有用性 (ユーザーが知りたい情報に対して適切な情報を含んでいるか)
					- 最終更新日 (最終更新日が含まれていない場合は無視し、総合評価に影響を与えない)
				`;

				const result = await generateObjectWithRetry({
					model: workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
					prompt: prompt,
					schema: z.object({
						url: z.string(),
						evaluation: z.object({
							信頼性: z.number().nullish(),
							有用性: z.number().nullish(),
							最終更新日: z.number().nullish(),
							総合評価: z.number().nullish(),
							理由: z.string().nullish(),
						})
					})
				})
				
				if (result === undefined) {
					return new Response('Failed to generate evaluations', {status: 500})
				}
				console.log(result.object)
				return result.object
			}))

			return new Response(JSON.stringify(evaluations), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				},
			});
		}
  }
}

