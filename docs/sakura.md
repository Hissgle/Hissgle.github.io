# 樱花飘落 + 鼠标划过特效

两个效果，全站所有页面生效：

1. **花瓣持续飘落** —— 从页面顶端缓缓落下，左右摆动、自身旋转（3D 翻转观感）
2. **鼠标划过扬起花瓣** —— 鼠标扫过处短暂扬起一小簇花瓣，随后散开、淡出消失

## 文件与开关

| 位置 | 作用 |
| --- | --- |
| `source/js/sakura.js` | 效果实现（单文件、无依赖） |
| `_config.butterfly.yml` 的 `inject.bottom` | 注入脚本 + 传配置参数 |

关闭整个效果：把 `inject.bottom` 里那行删掉即可。
只关鼠标效果：把 `data-trail` 改成 `"false"`。

## 调参数

改 `_config.butterfly.yml` 里 `inject.bottom` 的 `data-*` 值，**不用动 js 文件**：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `data-mobile` | `"false"` | 是否在窄屏（≤768px）上启用。默认关闭，手机性能和耗电考虑 |
| `data-density` | `"0.00007"` | 飘落密度。约等于 1920×1080 下同时约 70 片；嫌少就调大（如 `0.00015`） |
| `data-trail` | `"true"` | 鼠标划过效果开关 |
| `data-color` | `"#ffc0d0"` | 基础花瓣色，脚本会自动生成 6 档深浅变化 |
| `data-zindex` | `"1"` | 绘制层级，保持小值以免挡住内容 |

想临时看效果或关掉，浏览器控制台执行：

```js
window.sakura.petalCount()   // 当前飘落花瓣数
window.sakura.trailCount()   // 当前划过花瓣数
window.sakura.destroy()      // 立即移除效果（刷新页面即恢复）
```

## 实现要点

- **独立 canvas 覆盖层**，`position: fixed` + `pointer-events: none`，所以**不会挡住任何点击和文字选择**
- 按 `devicePixelRatio` 放大画布，高分屏不糊
- **尊重系统的「减少动态效果」**：开启 `prefers-reduced-motion: reduce` 时不加载
- 切到后台标签页时**暂停动画**，回来再恢复（不白烧 CPU 和电量）
- 划过花瓣有数量上限（160）和 900ms 左右的生命期，快速划动不会堆积
- 鼠标微小抖动（<3px）不生成花瓣，避免静止时原地堆叠
- `getContext('2d')` 不可用时**直接退出**，不留残留节点、不抛异常

## 为什么用 `data-*` 而不是内联脚本

最初写的是内联 `<script>window.SAKURA_CONFIG = { ... }</script>`，
但那段代码里的 `{ }` 在 YAML 里会被解析成映射，产生歧义。`data-*` 的值都是纯字符串，
不会有这个问题。

## 与其它特效的搭配

本站还开着 `click_heart`（点击冒爱心）。两者不冲突：爱心是点击时的小图标，
樱花是持续背景 + 划过效果。如果觉得画面太花，建议保留樱花、关掉 `click_heart`
（`_config.butterfly.yml` 里 `click_heart.enable: false`）。

另外页面还挂了 live2D 看板娘，它有自己的叠加层。樱花画布 `z-index: 1`，
低于 live2D，所以**不会盖住看板娘**。
