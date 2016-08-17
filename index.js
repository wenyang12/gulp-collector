/**
 * 通过script/link/style标签上的私有属性_group，收集html页面上的碎片引用
 * 收集后文件命名为_group属性提供的值
 * @author luoying
 */

'use strict';

const fs = require('fs');
const path = require('path');
const through2 = require('through2');
const resolvePath = require('@tools/resolve-path');

// 匹配css资源，link外链或style内联样式
const REG_CSS = /(?:<link.*href=["|'](.+\.css)["|'].*\/?>|<style.*>([^<]*)<\/style>)/gi;
// 匹配js资源，script外链或内联脚本
const REG_JS = /(?:<script.*src=["|'](.+\.js)["|'].*><\/script>|<script.*>([^<]*)<\/script>)/gi;
// 匹配css中的图片/字体资源
const REG_CSS_ASSETS = /url\(([^\)]+)\)/gi;
// 匹配_group私有属性
const REG_GROUP = /_group=["|']?([^"']+)["|']?/;

// 获取指定的静态资源引用列表
const getMatchs = (data, reg) => {
  let matchs = [];
  let match = null;
  while ((match = reg.exec(data))) matchs.push(match);
  return matchs;
};

// 获取_group私有属性值
const getGroup = (tag) => {
  let match = tag.match(REG_GROUP);
  return match ? match[1] : null;
};

// 取出资源内容
const getAsset = (pathname) => {
  try {
    return fs.readFileSync(pathname, 'utf8');
  } catch (e) {
    console.log(`not found the ${pathname}`);
    return '';
  }
};

// 按顺序合并资源列表
const concatAssets = (assets, root, type) => {
  let content = '';
  for (let asset of assets) {
    let base = root;
    let data = asset.data || '';
    if (asset.url) { // 外链资源，读取资源内容
      let pathname = path.join(root, asset.url);
      base = path.dirname(pathname);
      data = getAsset(pathname);
    }

    // 替换css中的图片/字体引用路径
    if (type === 'css') {
      data = resolvePath(data, base, root, REG_CSS_ASSETS);
    }

    content += data + '\n';
  }
  return content;
};

// 创建合并后的资源文件
const createConcatedAsset = (asset, data, dest) => {
  try {
    let file = `${dest}/${asset}`;
    fs.writeFileSync(file, data, 'utf8');
    return file;
  } catch (e) {
    console.error(e.stack);
    return '';
  }
};

const resolveAsset = (asset, root) => asset.replace(root, '');

// 注入合并后的资源引用到html文档中
const injectAsset = (html, asset, inject) => {
  let place = `</${inject}>`;
  let ext = path.extname(asset).slice(1);
  let tag = {
    css: `<link rel="stylesheet" href="${asset}" crossorigin="anonymous">\n`,
    js: `<script type="text/javascript" src="${asset}" crossorigin="anonymous"></script>\n`
  }[ext];
  return html.replace(place, tag + place);
};

const collector = {
  run(type, html, root, dest) {
    let reg = {
      css: REG_CSS,
      js: REG_JS
    }[type];
    let matchs = getMatchs(html, reg);

    // 所要合并的碎片资源列表
    let assets = {};

    // 提取要合并的资源
    for (let match of matchs) {
      let tag = match[0];
      let url = match[1];
      let group = getGroup(tag);

      // 未标记为合并的资源，略过
      if (!group) continue;

      if (!assets[group]) assets[group] = [];
      assets[group].push({
        url: url, // 外链
        data: match[2] // 内联
      });
      // 删除碎片资源的引用标签
      html = html.replace(tag, '');
    }

    let inject = {
      css: 'head',
      js: 'body'
    }[type];

    // 合并碎片资源，创建合并后的新资源文件
    for (let asset in assets) {
      let data = concatAssets(assets[asset], root, type);
      let file = createConcatedAsset(`${asset}.${type}`, data, dest);
      // 将合并后的新资源引用注入到html文档里
      file && (html = injectAsset(html, resolveAsset(file, root), inject));
    }

    return html;
  },

  css(html, root, dest) {
    return this.run('css', html, root, dest);
  },

  js(html, root, dest) {
    return this.run('js', html, root, dest);
  }
};

module.exports = (type, dest) => {
  return through2.obj((file, enc, callback) => {
    if (file.isNull()) {
      return callback(null, file);
    }

    let filename = file.path;
    let root = path.dirname(filename);
    let html = file.contents.toString();

    html = collector[type](html, root, path.resolve(root, dest));
    file.contents = new Buffer(html);
    callback(null, file);
  });
};
