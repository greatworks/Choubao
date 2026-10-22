# 《你个臭宝》点击钢琴旋律系统

## 玩法规则

- 第 1 关继续使用原有“臭宝 / 宝字音阶”教学音效，不引入歌曲。
- 从第 2 关开始，每关对应 1 首旋律。第 2-11 关依次使用 10 首曲目，第 12 关重新回到第 1 首，之后循环。
- 每关第 1 根正常成功消除的箭头播放奶声童音“臭宝”；第 2 根起从该关旋律的第 1 个音符开始演奏。
- 只在正常成功消除时推进曲谱。阻挡误触继续播放碰撞音，不推进旋律；擦除和魔法棒也不推进旋律。
- 曲谱走到末尾后立即回到该曲第 1 个音符。重开或进入新关卡时，旋律进度从头开始。
- 玩家点击速度决定实际演奏速度；谱面中的长短音只控制钢琴余音长度，保证快速连消时仍有清晰、轻盈的叠音。

## 十首曲目

| 关卡循环位 | 曲目 | 来源与年代 |
| --- | --- | --- |
| 1 | 两只老虎 / Frere Jacques | 18 世纪法国传统旋律 |
| 2 | 小星星 / Ah! vous dirai-je, Maman | 18 世纪法国传统旋律 |
| 3 | 欢乐颂 | 贝多芬《第九交响曲》，1824 |
| 4 | 铃儿响叮当 | James Lord Pierpont，1857 |
| 5 | 友谊地久天长 | 18 世纪苏格兰传统旋律 |
| 6 | 致爱丽丝 | 贝多芬 WoO 59，1867 年首次出版 |
| 7 | 勃拉姆斯摇篮曲 | 勃拉姆斯 Op.49 No.4，1868 |
| 8 | 土耳其进行曲 | 莫扎特钢琴奏鸣曲 K.331，约 1783 |
| 9 | 伦敦桥 | 英国传统童谣旋律 |
| 10 | 划船歌 / Row, Row, Row Your Boat | 19 世纪美国传统童谣旋律 |

## 版权控制

中国现行《著作权法》第二十三条规定，自然人作品的相关权利保护期通常为作者终生及去世后五十年。本曲库只选用传统旋律，或作者去世远超五十年的古典作品。

项目不下载、复制或打包任何第三方录音、表演、MIDI、现代编曲、歌词或新版乐谱文件。`src/melody-catalog.js` 仅保存为本游戏重新整理的基础单音旋律；最终声音由 `src/sound.js` 使用 WebAudio 实时合成。这样将“作品旋律”和“录音/表演/现代编曲”的权利风险分开，避免误用仍受保护的具体音源。

核验参考：

- [中华人民共和国著作权法（中国人大网）](https://www.npc.gov.cn/c2/c30834/202011/t20201119_308796.html)
- [Frere Jacques 公版乐谱](https://imslp.org/wiki/Fr%C3%A8re_Jacques_%28Rameau%2C_Jean-Philippe%29)
- [Ah! vous dirai-je, Maman 公版乐谱](https://imslp.org/wiki/Ah%21_vous_diraije%2C_Maman_%28Mozart%2C_Wolfgang_Amadeus%29)
- [贝多芬第九交响曲公版乐谱](https://imslp.org/wiki/Symphony_No.9_-_An_die_Freude_%28Beethoven%2C_Ludwig_van%29)
- [Jingle Bells 1857 年公版初版](https://imslp.org/wiki/Jingle_Bells_%28Pierpont%2C_James%29)
- [Auld Lang Syne 公版民歌乐谱](https://imslp.org/wiki/Auld_lang_syne_%28Folk_Songs%2C_Scottish%29)
- [致爱丽丝公版初版](https://imslp.org/wiki/Fur_elise)
- [勃拉姆斯摇篮曲公版初版](https://imslp.org/wiki/Wiegenlied_%28Brahms%2C_Johannes%29)
- [莫扎特 K.331 公版乐谱](https://imslp.org/wiki/Piano_Sonata_K.331_%28Mozart%2C_Wolfgang_Amadeus%29)
- [Public Domain Song Anthology](https://imslp.org/wiki/The_Public_Domain_Song_Anthology_%28Berger%2C_David%29)

以上是产品与工程侧的低风险筛选记录，不替代正式法律意见。若未来向著作权保护期不同的海外地区发行，应在当地上线前再次核验。

## 技术实现

- `melody-catalog.js`：曲目元数据、音名转频率、关卡选曲和曲内循环。
- `game-model.js`：维护每局 `melodyStep`，只在正常成功消除后递增。
- `sound.js`：首箭播放“臭宝”，后续读取对应音符并使用带击键瞬态的三振荡器钢琴包络合成。
- 曲谱名称和音程关系保持原始转写，播放时整体升高一个八度加纯五度，实际基频约为 `588-3140Hz`，在手机扬声器上更明亮活泼；半拍、单拍、长音使用明显不同的余音长度。
- 每次正确消除严格只演奏曲谱中的 1 个音符并推进 1 个位置，不因点击快慢额外补奏；快速连点按曲谱拍值做有限排队。
- BGM 在旋律音符触发时立即压至约 `0.018`，钢琴主击键峰值约为 `0.46`，另叠加泛音和短促击键层，使消除音更响亮、轻快且突出。
