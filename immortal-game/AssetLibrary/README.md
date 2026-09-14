# 2d_game 素材库

- `AI原始图/`：WorkBuddy ImageGen 生成的 1024px 原图（按 建筑/角色/装饰/UI/地形 分类）
- `_manifest.json`：每张图的用途（对应成品帧表第几帧）+ 扩展地图流程
- 成品（游戏直接引用的帧表）在 `2d_game/assets/`
- FreePixel 国风道具库在 `text_game/AssetLibrary/FreePixel`（未复制，避免重复占用空间）

## 扩地图三步
1. 选素材（本库 / FreePixel / 按 skill `game-asset-ai-pipeline` 生成新图）
2. `tools/build_v3.py`、`build_v4.py` 追加帧
3. `js/iso.js` 登记 frame/kind/阻挡，跑断言后发布
