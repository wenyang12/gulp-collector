/**
 * 通过script/link/style标签上的私有属性_group，收集html页面上的碎片引用
 * 收集后文件命名为_group属性提供的值
 * @author luoying
 */

'use strict';

const fs = require('fs');
const path = require('path');
const through2 = require('through2');
const gutil = require('gulp-util');
const File = gutil.File;
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

const replace = (html, type, root, dest) => {
  let inject = {
    css: 'head',
    js: 'body'
  }[type];

  // 所要合并的碎片资源列表
  let fragments = getFragments(html, type);
  for (let name in fragments) {
    let fs = fragments[name];
    for (let f of fs) {
      // 删除碎片资源的引用标签
      html = html.replace(f.tag, '');
    }

    let file = `${dest}/${name}.${type}`;
    // 将合并后的新资源引用注入到html文档里
    html = injectAsset(html, resolveAsset(file, root), inject);
  }

  return html;
};

// 获取所要合并的碎片列表
const getFragments = (html, type) => {
  let reg = {
    css: REG_CSS,
    js: REG_JS
  }[type];
  let matchs = getMatchs(html, reg);

  let fragments = {};

  // 提取要合并的资源
  for (let match of matchs) {
    let tag = match[0];
    let url = match[1];
    let group = getGroup(tag);

    // 未标记为合并的资源，略过
    if (!group) continue;

    if (!fragments[group]) fragments[group] = [];
    fragments[group].push({
      tag: tag,
      url: url, // 外链
      data: match[2] // 内联
    });
  }

  return fragments;
};

// 合并页面上的碎片资源
const collect = (html, type, root) => {
  let fragments = getFragments(html, type);
  let assets = []; // 合并后的资源列表
  for (let name in fragments) {
    assets.push({
      name: name,
      content: concatAssets(fragments[name], root, type)
    });
  }
  return assets;
};

module.exports = (type) => {
  return through2.obj(function(file, enc, callback) {
    if (file.isNull()) {
      return callback(null, file);
    }

    let root = path.dirname(file.path);
    let html = file.contents.toString();
    let assets = collect(html, type, root).map(asset => {
      return new File({
        cwd: './',
        base: './',
        path: `${asset.name}.${type}`,
        contents: new Buffer(asset.content)
      })
    });

    assets.forEach(asset => this.push(asset));
    callback(null);
  });
};

module.exports.replace = (type, dest) => {
  return through2.obj((file, enc, callback) => {
    if (file.isNull()) {
      return callback(null, file);
    }

    let root = path.dirname(file.path);
    let html = file.contents.toString();
    html = replace(html, type, root, dest);
    file.contents = new Buffer(html);
    callback(null, file);
  });
};
