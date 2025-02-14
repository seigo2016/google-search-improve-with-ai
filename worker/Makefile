gen-q:
	curl http://localhost:8787/generate-questions?keywords=cloudflare%20workers%20AI%20tutorial

eval:
	curl -X POST -d '{"urls": ["https://developers.cloudflare.com/workers-ai/tutorials", "https://zenn.dev/kameoncloud/articles/707b3b623bdb87", "https://dev.classmethod.jp/articles/cloudflare-workers-ai"], "original_keywords": "cloudflare workers AI tutorial", "suggested_questions": ["Cloudflare Workersを使用したAI機能の実装方法は？", "Cloudflare Workers上でのAIアプリケーションの開発チュートリアルはどこにありますか？", "Cloudflare WorkersとAIを組み合わせてどのような用途に利用できるのか？"]}' http://localhost:8787/evaluate-pages

	