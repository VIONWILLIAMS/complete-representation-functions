# CRF 0.8 参考来源与处理记录

本表从真实下载与学习记录生成。来源 URL 是照片详情页，SHA-256 标识实际下载字节；不会将搜索命中、未下载照片或原图的重复裁切伪装成新的独立作品。

构建快照：10 个逻辑检索轮次，11 次原生模型检索请求、2 次直接 Search API 请求；42 份按字节哈希去重的图像，42 张已实际提交视觉描述。

另有 10 次真实图像语义请求，合计 23 次**学习阶段**提供方请求。该数字不包含后续构图、图像评阅、修订或打磨调用；这些调用以生成案例的独立记录为准。

完整 SHA-256、来源页、检索请求、失败尝试、图像尺寸、视觉语义及拟合指标见 [learning.json](../../web/assets/v08/learning.json)。各来源的许可仍需以详情页和保留的许可字段为准；平台名称本身不是逐图许可证核验。

## 下载、裁切与拟合的区别

当前下载变体分布：`{"proportional_source_resize": 6, "source_og_crop": 33, "source_raster_or_unknown": 3}`。`source_og_crop` 表示实际使用了来源页 OG 裁切图；它保留原请求，不称作摄影者未裁切原片。表内尺寸是已下载图的解码尺寸。随后拟合的缩放/裁切尺寸在每个函数报告中单独记录。

Commons 文件可通过公开 imageinfo API 提取许可与作者；只有实际记录存在时才在表中标作已记录。Pexels 作者名优先从实际搜索返回的照片标题摘取，并标明这一来源。无法确认的作者和许可保持未核验状态。

## 实际收集的参考

| 轮次 / 图像 ID | 语义标签 | 作者与记录依据 | 来源 / 许可记录 | 下载尺寸与变体 | SHA-256 前缀 |
| --- | --- | --- | --- | --- | --- |
| 1 · `learn.r01.08d209b8092d` | 多块血橙与橙子切片俯视组合 | Sherali Khan（source_title） | [照片详情](https://www.pexels.com/zh-tw/photo/12267666/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `08d209b8092dee3f` |
| 1 · `learn.r01.9b10968eb8db` | 血橙切面微距特写 | Any Lane（source_title） | [照片详情](https://www.pexels.com/zh-tw/photo/5945786/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `9b10968eb8dbb0ad` |
| 1 · `learn.r01.adaf478e57c6` | 橙子、橙汁与切瓣静物组合 | Pablo de Haro（source_title） | [照片详情](https://www.pexels.com/fr-fr/photo/boire-jus-d-orange-oranges-fruit-15560947/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `adaf478e57c6dc6f` |
| 1 · `learn.r01.c6657129fc5c` | 横切橙子半 | Ricardo Utsumi（source_title） | [照片详情](https://www.pexels.com/photo/photograph-of-a-sliced-orange-5223989/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `c6657129fc5c5d3c` |
| 2 · `learn.r02.0095427d2cd5` | 白碗中三枚深红苹果 | Evgeniy Alekseyev（source_title） | [照片详情](https://www.pexels.com/photo/ripe-red-apples-in-bowl-on-white-background-7333128/)；逐图许可待核验 | 768 × 513；`proportional_source_resize` | `0095427d2cd586bd` |
| 2 · `learn.r02.41ed6a3fcd65` | 红白格布上的苹果堆与木墙 | Marcello Mastrodicasa（source_title） | [照片详情](https://www.pexels.com/photo/close-up-photo-of-apples-13705758/)；逐图许可待核验 | 768 × 512；`proportional_source_resize` | `41ed6a3fcd6516a1` |
| 2 · `learn.r02.43ba7b3b608d` | 米色背景三枚红苹果特写 | Deden Dicky Ramdhani（source_title） | [照片详情](https://www.pexels.com/photo/close-up-photo-of-red-apples-9938585/)；逐图许可待核验 | 768 × 1152；`proportional_source_resize` | `43ba7b3b608de2c4` |
| 2 · `learn.r02.886f81c7ec27` | 暗背景俯拍红黄苹果群 | Polat Eyyüp Albayrak（source_title） | [照片详情](https://www.pexels.com/photo/fresh-red-apples-on-wooden-surface-30668750/)；逐图许可待核验 | 768 × 1152；`proportional_source_resize` | `886f81c7ec274a62` |
| 2 · `learn.r02.bad8c208b25c` | 青苹果密集堆叠特写 | RP Photography（source_title） | [照片详情](https://www.pexels.com/photo/green-apple-lot-693794/)；逐图许可待核验 | 768 × 535；`proportional_source_resize` | `bad8c208b25c8aa0` |
| 2 · `learn.r02.c13e8dd521c2` | 手持两只黄绿梨与桌面梨堆 | hissetmehurriyeti（source_title） | [照片详情](https://www.pexels.com/photo/crop-person-showing-ripe-apples-at-home-8416545/)；逐图许可待核验 | 768 × 1367；`proportional_source_resize` | `c13e8dd521c2469b` |
| 3 · `learn.r03.097cfbf071e3` | 青蓝色釉陶瓷花瓶 | 作者未在下载记录中单独核验（unverified） | [照片详情](https://commons.wikimedia.org/wiki/File:Japanese_-_Vase_(kabin)_-_Walters_491668_-_Profile.jpg#1)；逐图许可待核验 | 1427 × 1799；`source_raster_or_unknown` | `097cfbf071e31851` |
| 4 · `learn.r04.8fa1d7612d73` | 手冲滤杯与玻璃壶 | Israyosoy S.（source_title） | [照片详情](https://www.pexels.com/pt-br/foto/configuracao-aconchegante-para-cafe-interno-com-hario-v60-29507972/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `8fa1d7612d73a633` |
| 4 · `learn.r04.9abbc6edf6d6` | 俯拍书桌与咖啡杯 | Tony Schnagl（source_title） | [照片详情](https://www.pexels.com/photo/person-writing-on-a-notebook-5588395/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `9abbc6edf6d6e677` |
| 4 · `learn.r04.ba8ec1aa482e` | 木桌拿铁咖啡杯 | Cut Nanda Oemar（source_title） | [照片详情](https://www.pexels.com/fr-fr/photo/tasse-a-cafe-minimaliste-en-ceramique-sur-une-table-en-bois-39187955/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `ba8ec1aa482ec288` |
| 4 · `learn.r04.c2f1cb0642a5` | 白色马克杯与深棕咖啡 | James Collington（source_title） | [照片详情](https://www.pexels.com/photo/cozy-morning-with-sunlit-coffee-mug-35970499/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `c2f1cb0642a55d68` |
| 5 · `learn.r05.67fd559a57f5` | 绿色蕨类叶片特写 | Bảo Minh（source_title） | [照片详情](https://www.pexels.com/photo/lush-green-fern-leaves-close-up-nature-photography-30659564/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `67fd559a57f55edf` |
| 5 · `learn.r05.92830dd7cdf2` | 棕褐色放射状褶皱表面近景 | Skyler Ewing（source_title） | [照片详情](https://www.pexels.com/photo/extreme-close-up-of-candy-12458501/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `92830dd7cdf261f5` |
| 5 · `learn.r05.a5353610c875` | 蕨类复叶层叠近景 | cottonbro studio（source_title） | [照片详情](https://www.pexels.com/photo/green-leaves-of-a-fern-plant-5993687/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `a5353610c87581c1` |
| 6 · `learn.r06.6cabbc1ac49e` | 悬挂式黑色交通信号灯组 | Dirk Baker（source_title） | [照片详情](https://www.pexels.com/photo/urban-traffic-light-against-historic-building-38078925/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `6cabbc1ac49e521d` |
| 6 · `learn.r06.8fc2a8a52e21` | 黄壳悬挂交通信号灯 | Optical Chemist（source_title） | [照片详情](https://www.pexels.com/photo/new-york-city-traffic-light-against-urban-skyline-35912156/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `8fc2a8a52e2193ed` |
| 6 · `learn.r06.9e74278ca935` | 秋日街角信号柱与标牌 | Katia Miasoed（source_title） | [照片详情](https://www.pexels.com/fr-fr/photo/ville-automne-tomber-passage-cloute-18794032/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `9e74278ca93506a5` |
| 6 · `learn.r06.a23c10c20c8a` | 红色行人过街信号灯与倒计时 | Clarissa Schwarz（source_title） | [照片详情](https://www.pexels.com/photo/pedestrian-traffic-light-in-amsterdam-netherlands-19901332/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `a23c10c20c8a5fed` |
| 6 · `learn.r06.bae383fa0e3c` | 行人过街操作指示牌 | Nathaniel B. Gerhart（source_title） | [照片详情](https://www.pexels.com/fr-fr/photo/texte-nature-morte-panneau-panneau-de-signalisation-7837387/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `bae383fa0e3ca9a7` |
| 7 · `learn.r07.7be8fd8c005a` | 浅色墙面、檐口与叶影 | Lara（source_title） | [照片详情](https://www.pexels.com/photo/elegant-window-shadow-play-on-sunlit-wall-33794191/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `7be8fd8c005aca1b` |
| 7 · `learn.r07.97c1ada5f673` | 旧式黄色木框窗 | 作者未在下载记录中单独核验（unverified） | [照片详情](https://www.pexels.com/zh-cn/photo/37152155/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `97c1ada5f6737a81` |
| 7 · `learn.r07.b29b99c456f0` | 黑白建筑立面与成排窗户 | 作者未在下载记录中单独核验（unverified） | [照片详情](https://www.pexels.com/zh-cn/photo/22820358/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `b29b99c456f076de` |
| 7 · `learn.r07.d52e20c8a621` | 铁栅窗与网格投影 | Zehra İslamoğlu（source_title） | [照片详情](https://www.pexels.com/zh-tw/photo/32560039/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `d52e20c8a6219a54` |
| 7 · `learn.r07.e5b9718f97b0` | 白砖墙转角与人物剪影 | Аlex Ugolkov（source_title） | [照片详情](https://www.pexels.com/photo/shadow-of-person-on-a-brick-wall-8806467/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `e5b9718f97b03932` |
| 7 · `learn.r07.f753d14554eb` | 金色时刻建筑立面与成排窗 | 作者未在下载记录中单独核验（unverified） | [照片详情](https://www.pexels.com/zh-cn/photo/32609760/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `f753d14554eb3ffd` |
| 8 · `learn.r08.149daf39fcc3` | 云雾中的阿尔卑斯湖谷 | VISHNEVA（source_title） | [照片详情](https://www.pexels.com/photo/tranquil-alpine-lake-with-majestic-mountains-32481616/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `149daf39fcc3d718` |
| 8 · `learn.r08.6cc4b3bbcdee` | 清澈浅滩与灰白岩壁湖泊 | Mauro Morandini（source_title） | [照片详情](https://www.pexels.com/fr-fr/photo/lac-alpin-pittoresque-avec-vue-majestueuse-sur-les-montagnes-35259426/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `6cc4b3bbcdee256a` |
| 8 · `learn.r08.af5435d03024` | 木构架下的高山湖泊倒影 | Christopher Beck（source_title） | [照片详情](https://www.pexels.com/photo/photo-of-a-calm-lake-5930143/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `af5435d030242e9b` |
| 9 · `learn.r09.17ca6bb42cb4` | 退潮礁坪潮池与云影倒映 | 作者未在下载记录中单独核验（unverified） | [照片详情](https://www.pexels.com/zh-cn/photo/33561680/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `17ca6bb42cb4f1b7` |
| 9 · `learn.r09.4c080a1da58a` | 沙滩上黑色层状礁岩与浅水泡沫 | chabraoui el hachemi（source_title） | [照片详情](https://www.pexels.com/photo/scenic-beach-view-in-casablanca-morocco-34548031/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `4c080a1da58ae666` |
| 9 · `learn.r09.ac4e4abcbaf7` | 阴天风浪中的深色礁石与白色浪花 | 作者未在下载记录中单独核验（unverified） | [照片详情](https://commons.wikimedia.org/wiki/File:Rocks_and_waves_windy_day_Jersey_shore_Atlantic_Ocean.JPG)；逐图许可待核验 | 977 × 852；`source_raster_or_unknown` | `ac4e4abcbaf741b1` |
| 9 · `learn.r09.f4e32f1238be` | 海浪冲击黄褐色礁石溅起白色水花 | Elchino portrait（source_title） | [照片详情](https://www.pexels.com/photo/ocean-waves-crashing-on-rocks-in-huatulco-mexico-39525901/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `f4e32f1238be63e3` |
| 9 · `learn.r09.fd06c878ce46` | 植被覆盖的海蚀拱岩岛 | V Bawa（source_title） | [照片详情](https://www.pexels.com/photo/rocks-on-sea-shore-on-zipolite-beach-in-mexico-17859760/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `fd06c878ce46355a` |
| 10 · `learn.r10.12d831e2492f` | 红杉林中穿透的光柱 | 作者未在下载记录中单独核验（unverified） | [照片详情](https://commons.wikimedia.org/wiki/File:Trees_and_sunshine.JPG#1)；逐图许可待核验 | 2048 × 1536；`source_raster_or_unknown` | `12d831e2492fc69c` |
| 10 · `learn.r10.1a6326953bf2` | 斑驳光影中的杂木林与细树干 | Every Stuff（source_title） | [照片详情](https://www.pexels.com/photo/serene-forest-landscape-in-dappled-sunlight-36004349/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `1a6326953bf2be52` |
| 10 · `learn.r10.20ded35e203e` | 密集掌状小叶绿色地被植物 | Diana ✨（source_title） | [照片详情](https://www.pexels.com/photo/green-plants-with-small-long-leaves-4261763/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `20ded35e203e5ad2` |
| 10 · `learn.r10.5b0dd12af418` | 幽暗树林与林下亮绿灌草 | Vizi Kata（source_title） | [照片详情](https://www.pexels.com/photo/serene-forest-scene-with-sunlit-trees-38042886/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `5b0dd12af418089f` |
| 10 · `learn.r10.5cbf8dbb8c71` | 枯黄落叶堆积地面 | neilstha firman（source_title） | [照片详情](https://www.pexels.com/photo/autumn-leaves-in-a-natural-forest-setting-40595499/)；逐图许可待核验 | 1100 × 627；`source_og_crop` | `5cbf8dbb8c717951` |

## 对象分割的人工辅助

以下对象不能被描述为完全自动学习得到的精确 alpha。它们先由视觉估计框与 GrabCut 提取，再经过记录中的人工审阅修正；边缘仍属于推断覆盖率。

- `learn.r03.097cfbf071e3.object`（青蓝色釉陶瓷花瓶）：Visually reviewed blue-vase chroma constraint B-R>7 removes the neutral floor shadow; holes filled inside the body.
- `learn.r04.ba8ec1aa482e.object`（木桌拿铁咖啡杯）：Manually reviewed closed cubic contour on the original reference restores the complete visible cup body; four-times supersampled coverage replaces the failed GrabCut boundary.
- `learn.r04.c2f1cb0642a5.object`（白色马克杯与深棕咖啡）：Manually reviewed closed cubic contour on the original reference restores the complete visible cup body; four-times supersampled coverage replaces the failed GrabCut boundary.

## 失败与质量结果

保留 69 条未成功来源尝试，错误分布为 `{"http_401": 49, "source_is_not_photo_detail": 2, "size_limit": 7, "no_supported_image": 6, "invalid_image_container": 2, "http_429": 3}`。返回 401/403 的来源停止使用；补齐检索记录为同一逻辑轮的追加尝试。

全图已拟合 42 个，对象已拟合 14 个；拟合成功不等于质量门槛通过。所有低质量结果仍保留在 ledger 中。全图待拟合 0，待视觉描述 0。

视觉语义共提出 16 个对象或对象组候选，其中 2 个尚未提取。对象拟合清单中的 pending=0 只指已经登记的作业，不会把尚未进入提取阶段的候选算成完成。目录中明确允许用于组合的对象函数有 9 个；此许可不代表其物理接地或轮廓已由真值验证。

构建时重新检查了 42 份下载文件的 SHA-256；缺失或哈希不符 0 份，已拟合资产所需文件缺失 0 个。

尚未提取的候选：`learn.r02.43ba7b3b608d`（米色背景三枚红苹果特写）；`learn.r02.0095427d2cd5`（白碗中三枚深红苹果）

原始红绿灯街景来自用户提供的参考照片；旧版已保留案例沿用既有来源记录，不混入本次网络学习的下载计数。

## 重建本文件

```sh
python scripts/build_v08_learning_report.py
```

脚本不调用模型、不下载图片，只从已有证据重新生成发布快照、来源表与 README 数量。
