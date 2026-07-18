# cefr.json の出典・ライセンス

`cefr.json`（単語→CEFRレベルの対応表）は、以下2つのデータセットを統合して生成した。
生成スクリプトはこのリポジトリには含めていない（一度限りの変換作業）が、手順は本ファイル末尾に記す。

## データソース

1. **CEFR-J Wordlist Version 1.5**（A1〜B2）
   編纂: 東京外国語大学 投野由紀夫研究室
   配布元: http://www.cefr-j.org/download.html
   （本リポジトリでは GitHub 上の CSV ミラーを使用: https://github.com/openlanguageprofiles/olp-en-cefrj/blob/master/cefrj-vocabulary-profile-1.5.csv）
   利用規約（配布元 README より引用）:
   > CEFR-J vocabulary and grammar profile datasets can be used for research and commercial purposes with no charge, provided that you cite the dataset properly. The copyright belongs to Tono Laboratory at TUFS (Tokyo University of Foreign Studies).

   引用: 『CEFR-J Wordlist Version 1.5』東京外国語大学投野由紀夫研究室. Retrieved from http://www.cefr-j.org/download.html

2. **Octanove Vocabulary Profile C1/C2 Version 1.0**（C1〜C2、CEFR-J が対象外とする上位レベルを補完）
   作成: Octanove Labs（http://www.octanove.com/）
   配布元: https://github.com/openlanguageprofiles/olp-en-cefrj/blob/master/octanove-vocabulary-profile-c1c2-1.0.csv
   ライセンス: [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)

両データセットとも [openlanguageprofiles/olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) が CSV 形式で公開しているものを利用した。

## 変換方法（`cefr.json` の生成手順）

1. 上記2つの CSV から `headword,CEFR` を読み取る。
2. `headword` が `a.m./A.M./am/AM` のようにスラッシュ区切りで複数表記を持つ場合、各表記を個別のキーとして展開する。
3. すべて小文字化して `word -> CEFR` のマップを作る。
4. 同じ語が複数の品詞・複数データセットに重複して出現し CEFR レベルが競合する場合は、**より易しい（低い）レベルを採用**する（A1 < A2 < B1 < B2 < C1 < C2）。理由: その語が最初に学習範囲に入るレベルを表すのが実用上妥当なため。

この方針・出典は [docs/roadmap/06-cefr.md](../../docs/roadmap/06-cefr.md) の設計判断と対応している。

## 注意

- CEFR-J 側の利用規約は「再配布」を明示的に許可する文言ではなく「引用すれば研究・教育・商用に無償利用可」「改変して別の語彙表を作ってよい（要引用）」という文言に基づく。本ファイルでの引用表記をもってこれを満たす。
- Octanove データは CC BY-SA 4.0 のため、本統合データも同ライセンスの継承（表示・同一条件許諾）が及ぶと解釈する。
- 収録は原形のみ（語形変化・活用形はカバーしない）。見つからない単語は未判定（空文字）として扱う。
