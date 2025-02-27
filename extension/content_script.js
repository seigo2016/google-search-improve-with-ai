(async function() {
  let userApiKey = 'RVadSFwcQ4xTCowj8pJfdWd9TnG00Hf5';
  let host = 'https://gsiai.seigo2016.com';

  if (!userApiKey) {
    console.error('APIキーが設定されていません');
    return;
  }

  // --- ユーティリティ関数 ---
  // URLのクエリパラメータからqパラメータ（検索キーワード）を取得
  function getSearchKeyword() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('q') || '';
  }

  // Googleの検索結果から各結果のURLを抽出する（h3タグを持つリンクを対象）
  function extractSearchResultUrls() {
    const urls = [];
    // Googleの検索結果は aタグの中に h3 があるものが対象
    document.querySelectorAll('a > h3').forEach(h3 => {
      const aTag = h3.closest('a');
      // href属性があるものだけを対象とする
      if (aTag && aTag.href) {
        urls.push(aTag.href);
      }
    });
    return urls;
  }

  // 検索結果タイトルの前にスコア表示用のspanを挿入する
  function addScoreToSearchResult(resultUrl, score, reason) {
    // 対象となる a > h3 をすべてチェックし、hrefにresultUrlが含まれるものにスコアを追加
    document.querySelectorAll('a > h3').forEach(h3 => {
      const aTag = h3.closest('a');
      if (aTag && aTag.href && aTag.href.indexOf(resultUrl) !== -1) {
        // すでにスコアが追加されていないか確認
        let scoreSpan = h3.querySelector('.evaluation-score');
        if (!scoreSpan) {
          scoreSpan = document.createElement('span');
          scoreSpan.className = 'evaluation-score';
          scoreSpan.style.display = 'inline-block';
          scoreSpan.style.backgroundColor = '#ffd54f';
          scoreSpan.style.color = '#000';
          scoreSpan.style.fontWeight = 'bold';
          scoreSpan.style.padding = '2px 4px';
          scoreSpan.style.marginRight = '6px';
          h3.prepend(scoreSpan);
        }
        // スコアを更新
        scoreSpan.textContent = `[${score}]`;

        // 理由のオーバーレイを作成
        const reasonOverlay = document.createElement('div');
        reasonOverlay.className = 'reason-overlay';
        reasonOverlay.style.position = 'absolute';
        reasonOverlay.style.backgroundColor = '#fff';
        reasonOverlay.style.border = '1px solid #ccc';
        reasonOverlay.style.padding = '10px';
        reasonOverlay.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        reasonOverlay.style.display = 'none';
        reasonOverlay.style.zIndex = '1000';
        reasonOverlay.textContent = reason;
        document.body.appendChild(reasonOverlay);

        // ホバーイベントを追加
        scoreSpan.addEventListener('mouseenter', () => {
          const rect = scoreSpan.getBoundingClientRect();
          reasonOverlay.style.top = `${rect.bottom + window.scrollY}px`;
          reasonOverlay.style.left = `${rect.left + window.scrollX}px`;
          reasonOverlay.style.display = 'block';
        });

        scoreSpan.addEventListener('mouseleave', () => {
          reasonOverlay.style.display = 'none';
        });
      }
    });
  }

  // --- メイン処理 ---
  const keyword = getSearchKeyword();
  if (!keyword) {
    return;
  }

  // 1. ユーザーが検索したキーワードを元に、/generate-questionsにリクエスト
  async function fetchQuestions(keyword) {
    const url = `${host}/generate-questions?keywords=${encodeURIComponent(keyword)}`;
    try {
      const res = await fetch(url, {
        headers: {
          "Authorization": userApiKey
        }
      });
      console.log(res);
      if (!res.ok) throw new Error("質問生成APIへのリクエストに失敗しました");
      const data = await res.json();
      return data; // 例: ["質問1", "質問2", "質問3"]
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  // 2. 質問パネルをページ上部に追加し、ユーザーが選択できるようにする
  function insertQuestionPanel(questions) {
    const panel = document.createElement('div');
    panel.id = "question-panel";
    panel.style.width = "100%";
    panel.style.display = "flex";
    panel.style.flexWrap = "wrap";
    panel.style.padding = "10px";
    panel.style.margin = "10px 0";
    panel.style.backgroundColor = "#f1f1f1";
    panel.style.border = "1px solid #ccc";
    panel.style.borderRadius = "4px";

    const title = document.createElement('div');
    title.textContent = "おすすめの質問を選択してください：";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "8px";
    panel.appendChild(title);

    // 各質問をボタンとして表示
    questions.forEach(question => {
      const btn = document.createElement('button');
      btn.textContent = question;
      btn.style.marginRight = "6px";
      btn.style.marginBottom = "6px";
      btn.addEventListener('click', () => {
        // 選択状態をビジュアルに示す
        panel.querySelectorAll('button').forEach(b => b.style.backgroundColor = '');
        btn.style.backgroundColor = "#a8d0e6";
        // 選択された質問を元に評価プロセスを実行
        evaluatePages(question);
      });
      panel.appendChild(btn);
    });

    // パネルを検索結果上部に挿入
    // Google検索結果のコンテナは #search など（必要に応じてセレクタは変更）
    const searchContainer = document.querySelectorAll('[role="main"]').item(0);
    if (searchContainer) {
      searchContainer.prepend(panel);
    } else {
      // 万が一見つからなければbodyの先頭に追加
      document.body.prepend(panel);
    }
  }

  // 3. ユーザーが選択した質問と、元のキーワード、検索結果のURLを/evaluate-pagesに送信し、評価結果を取得する
  async function evaluatePages(selectedQuestion) {
    // 検索結果のURLを抽出
    const urls = extractSearchResultUrls();
    if (urls.length === 0) {
      console.warn("検索結果のURLが見つかりませんでした");
      return;
    }
    const payload = {
      urls: urls.slice(0, 5), // 5件までの評価を実施
      original_keywords: keyword,
      suggested_question: selectedQuestion
    };

    try {
      const res = await fetch(`${host}/evaluate-pages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": userApiKey
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("ページ評価APIへのリクエストに失敗しました");
      const evaluations = await res.json();
      // evaluations は各ページごとの評価結果の配列。評価結果の総合評価（総合評価）を取得して表示
      evaluations.forEach(evaluationObj => {
        const { url: evaluatedUrl, evaluation } = evaluationObj;
        if (evaluation && typeof evaluation.総合評価 === 'number') {
          addScoreToSearchResult(evaluatedUrl, evaluation.総合評価, evaluation.理由);
        }
      });
    } catch (error) {
      console.error(error);
    }
  }

  // --- 初期処理 ---
  const questions = await fetchQuestions(keyword);
  console.log(questions);
  if (questions && questions.length > 0) {
    insertQuestionPanel(questions);
  }
})();
