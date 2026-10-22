# “你个臭宝”背景音乐设计说明

## 设计目标

背景音乐服务于轻量空间解谜：提升愉悦感和沉浸感，但不抢占观察箭头、判断遮挡关系所需的注意力。设计目标是“长时间不烦、操作反馈清楚、随时可关闭”，不以持续升速、高声压或不可关闭音乐制造压力。

## 调研依据

- [Adaptive Music Composition for Games](https://arxiv.org/abs/1907.01154) 的游戏实验观察到，自适应音乐条件下的主观沉浸与音乐事件关联均有小幅正向效果，因此本项目让音乐音量随首页、游玩、暂停、连击和通关语音轻度变化。
- [Background Music and Cognitive Task Performance: A Systematic Review](https://journals.sagepub.com/doi/10.1177/20592043221134392) 指出背景音乐对认知任务的影响取决于任务、音乐和人群，歌词及高难任务更容易受到干扰，因此本项目采用无歌词、低密度、低声压配器，并保留独立关闭开关。
- [Piecing It Together: The Effect of Background Music on Children’s Puzzle Assembly](https://journals.sagepub.com/doi/10.1177/0031512517752817) 的实验中，无歌词音乐条件下的儿童拼图完成量高于有歌词与无音乐条件，为本项目选择纯器乐提供了直接参考。
- [Faster, Harder?](https://www.dfki.de/web/forschung/projekte-publikationen/publikation/13472) 发现变化的游戏音乐速度会影响压力、动机和娱乐感，但未显著改善表现，因此本项目保持 104 BPM，不随难度强行提速。
- [An Analysis of Repetition in Video Game Music](https://boblsturm.github.io/aimusic2020/papers/CSMC__MuMe_2020_paper_10.pdf) 强调重复本身是音乐结构的重要组成部分；本项目保留可记忆动机，同时用更长结构、主题变奏和配器增减降低短循环疲劳。

## 音乐规格

- 原创方式：`scripts/generate-bgm.js` 以固定规则和确定性噪声从零合成，不引用外部录音、采样、MIDI 或现成旋律。
- 调式与速度：C 大调及五声音阶色彩，104 BPM，4/4 拍。
- 曲式：24 小节 A/A′/B，约 55.38 秒无缝循环。
- 配器：玩具木琴主旋律、软弹贝斯、轻拨弦和低存在感木块/沙锤。
- 留白：每四小节减少尾部打击乐，每八小节增加一次轻量滑音作为段落标记。
- 文件：单声道 12 kHz、16-bit PCM WAV，约 1.30 MB。

## 动态混音

- 首页：约 `0.18`，展示完整品牌气质。
- 关卡：约 `0.145`，给判断和点击音效让位。
- 五连击以上：仅小幅增加约 `0.012`，不改变速度。
- 普通弹窗：约 `0.09`。
- 通关及“臭宝”语音：约 `0.052-0.055`，确保品牌语音清晰。
- 第 2 关起的点击钢琴旋律由 WebAudio 独立实时合成；旋律整体升高一个八度加纯五度并强化卡通击键瞬态，每个音符触发时将 BGM 立即压至约 `0.018`。每次正确点击只发出 1 个曲谱音符，快速连续点击按曲谱拍值短暂排队，兼顾节奏与操作反馈。
- 设置：音乐与音效分开控制，默认开启，旧存档自动补齐字段。

## 再生成

```powershell
node scripts\generate-bgm.js
node scripts\build-preview.js
node tests\run-tests.js
```
