'use strict';

/**
 * B 站视频嵌入标签
 *
 * 用法：
 *   {% bilibili BV1xN411J77y %}
 *   {% bilibili BV1xN411J77y 2 %}     // 指定分P
 *   {% bilibili av491264778 %}        // 也支持 av 号
 *
 * 输出 16:9 响应式容器，宽高比与圆角由 source/css/article-images.css 里的
 * .bili-embed 控制，避免在文章里写死像素尺寸。
 */
function bilibiliTag(args) {
  var id = (args[0] || '').trim();
  var page = (args[1] || '1').trim();

  if (!id) return '';

  // 统一成 bvid 参数；av 号则转成 aid
  var param;
  if (/^BV[0-9A-Za-z]{10}$/i.test(id)) {
    param = 'bvid=' + id;
  } else if (/^av\d+$/i.test(id)) {
    param = 'aid=' + id.slice(2);
  } else if (/^\d+$/.test(id)) {
    param = 'aid=' + id;
  } else {
    // 也允许直接贴完整播放页链接
    var m = id.match(/(BV[0-9A-Za-z]{10})/i);
    if (!m) return '';
    param = 'bvid=' + m[1];
  }

  var src = '//player.bilibili.com/player.html?' + param +
    '&page=' + encodeURIComponent(page) +
    '&high_quality=1&danmaku=1&autoplay=0';

  return '<div class="bili-embed">' +
    '<iframe src="' + src + '" scrolling="no" frameborder="no" framespacing="0" ' +
    'allowfullscreen="true" loading="lazy" title="哔哩哔哩视频"></iframe>' +
    '</div>';
}

hexo.extend.tag.register('bilibili', bilibiliTag, { ends: false });
