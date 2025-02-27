import * as htmlparser2 from "htmlparser2";
import { z } from 'zod';
// import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { ChatCompletionSystemMessageParam } from "openai/resources/index.mjs";
import { GenerationConfig, GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// const GEMINI_MODEL = gemini-2.0-flash-lite-preview-02-05
const GEMINI_MODEL = "gemini-1.5-flash-8b"

export default {
  async fetch(request: Request, env: Env) {
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

		// const openai = new OpenAI({
		// 	apiKey: env.OPENAI_API_KEY,
		// 	baseURL: env.AI_ENDPOINT
		// })
		const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)

		if (url.pathname === '/generate-questions') {
			const keywords = url.searchParams.get('keywords')?.split(' ')
			if (!keywords) {
				return new Response('No keywords provided', {status: 400})
			}
			const promptBody = `ユーザーは以下のキーワードで情報を探しています:
					${keywords.map(keyword => `- ${keyword}`).join('\n')}
			上記に関して、ユーザーが本当に知りたいと思われる質問を3つ、簡潔に**日本語で**提案してください。
		`
			const prompt = [
				{
					role: 'system',
					content: promptBody,
				},
			]

			const generationConfig: GenerationConfig = {
				temperature: 1,
				maxOutputTokens: 2048,
				responseMimeType: 'application/json',
				responseSchema: {
					type: SchemaType.ARRAY,
					items: {
						type: SchemaType.STRING
					}
				}
			}
			const model = genAI.getGenerativeModel({ model: GEMINI_MODEL,
				generationConfig: generationConfig
			})
			const resultRaw = await model.generateContent(promptBody)
			const result = resultRaw.response.text()
			// const completion = await openai.beta.chat.completions.parse({
			// 	model: 'gpt-4o-mini',
			// 	messages: prompt,
			// 	max_tokens: 2048,
			// 	response_format: zodResponseFormat(z.object({
			// 		questions: z.array(z.string())
			// 	}), "questions")
			// })
			// const result = completion.choices[0].message.parsed

			return new Response(result, {
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
				suggested_question: string
			}
			// URLの配列からページの内容を取得
			const pages = await Promise.all(req.urls.map(async (url) => {
				const response = await fetch(url)
				if (!response.ok || response.body === null) {
					// スキップ
					return {
						body: '',
						url: url
					}
				}
				const bodyRaw = await response.text();
				const document = htmlparser2.parseDocument(bodyRaw);
				// タグやスクリプトを削除
				htmlparser2.DomUtils.findAll(elem => elem.tagName === 'script', document.childNodes).forEach(elem => htmlparser2.DomUtils.removeElement(elem));
				htmlparser2.DomUtils.findAll(elem => elem.tagName === 'style', document.childNodes).forEach(elem => htmlparser2.DomUtils.removeElement(elem));
				
				const bodyText = htmlparser2.DomUtils.textContent(document);return {
					body: bodyText.replaceAll(' ', '').replaceAll('　', '').replace(/[\s]/g, " ").replace(/[\s]/g, " "),
					url: url
				}
			}))
			
			// 評価を取得
			const evaluations = await Promise.all(pages.map(async (page) => {
				if (page === undefined ) {
					return {
						url: '',
						evaluation: {
							総合評価: null,
							理由: null,
						}
					}
				}
				const promptBody = `## 元の検索ワード
				${req.original_keywords.split(' ').map(keyword => `- ${keyword}`).join('\n')}
				
				## ユーザーが知りたいと思われる質問
				${req.suggested_question}
				
				## 評価
				あなたは元の検索キーワードについて専門的な知識を持っています。他のエンジニアにすすめることのできる記事かどうかの評価を厳しく行う必要があります。
				
				次のページは上記の質問に対してどの程度適切な回答や情報を含んでいますか？
				以下の評価軸をもとに**0から10の範囲**でスコアをつけてください。
				
				## 評価軸
				重要な評価軸は優先順位順に以下の通りです:
				- 減点内容が含まれていないこと
				- 信頼性 (公式docs / 学術論文 / 信頼できる情報源からの引用であること、自社の宣伝や自社が提供するスクールへの誘導が含まれていないこと、誤情報が含まれていないこと、SEOのためにキーワードが羅列されたコンテンツがふくまれていないこと)
				- 有用性 (ユーザーが知りたい情報に対して適切な情報を含んでいること、ユーザーの知りたい情報が占める割合が記事の多くの部分を占めること)
				- 最終更新日 (最終更新日が含まれていない場合は無視し、総合評価に影響を与えない)
						
				### 減点内容
				次の内容のようなコンテンツがどれか1つでも含まれている場合、総合評価を下げてください:
				- プログラミングスクールや関連企業のコンテンツである
				- 単純で基礎的な内容や表面的な内容の紹介である
				- 不必要に関連するキーワードを提示している(多くの場合はSEOのためであることが知られています)
				- 内容が同じ内容の言い換えばかりである
				- (公式ドキュメントでないとき)公式ドキュメントの内容を転載したような内容である
				
				## 出力
				最後に、以下の情報を次のzodスキーマにあうように提供してください:
				- 総合評価 (0から10の範囲の整数)
				- 理由 (総合評価の根拠を簡潔に記述してください)
				---
				z.object({
						"総合評価": z.number().int().min(0).max(10),
						"理由": z.string()
				})
				---
				
				## ページのURL
				${page.url}
				
				## ページの内容
				${page.body}
				`
				// キーワードをmdのリストにする
				const prompt = {
					role: 'system',
					content: promptBody }  as ChatCompletionSystemMessageParam
				try {
					const generationConfig: GenerationConfig = {
						temperature: 1,
						maxOutputTokens: 1024,
						responseMimeType: 'application/json',
						responseSchema: {
							type: SchemaType.OBJECT,
							properties: {
								"総合評価": {
									type: SchemaType.INTEGER
								},
								"理由": {
									type: SchemaType.STRING,
								}
							},
							required: ["総合評価", "理由"]
						}
					}
					const model = genAI.getGenerativeModel({ model: GEMINI_MODEL,
						generationConfig: generationConfig
					})
					const resultRaw = await model.generateContent(promptBody)
					// const result = resultRaw.response.text()
					// const completion = await openai.beta.chat.completions.parse({
					// 	model: 'gpt-4o-mini',
					// 	messages: [prompt],
					// 	max_tokens: 2048,
					// 	response_format: zodResponseFormat(z.object({
					// 		questions: z.object({
					// 			"総合評価": z.number().nullish(),
					// 			"理由": z.string().nullish(),
					// 		})
					// 	}), "questions")
					// })
					// const result = completion.choices[0].message.parsed
					// 総合評価を整数に変換
					// console.log(resultRaw.response.text())
					const result = z.object({
						"総合評価": z.number().int().min(0).max(10),
						"理由": z.string()
					}).parse(JSON.parse(resultRaw.response.text()))
					return {
						url: page.url,
						evaluation: result
					}
				} catch (error) {
					console.log(prompt)
					console.error(error)
				}

			}))
			// evaluationsがnullの場合は削除
			const filteredEvaluations = evaluations.filter(evaluation => evaluation != null)
			return new Response(JSON.stringify(filteredEvaluations), {
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

