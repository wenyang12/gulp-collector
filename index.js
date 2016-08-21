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
const getMatchs = require('@tools/matchs');
const resolvePath = require('@tools/resolve-path');

// 匹配css资源，link外链或style内联样式
const REG_CSS = /(?:<link.*href=["|'](.+\.css)["|'].*\/?>|<style.*>([^<]*)<\/style>)/gi;
// 匹配js资源，script外链或内联脚本
const REG_JS = /(?:<script.*src=["|'](.+\.js)["|'].*><\/script>|<script.*>([^<]*)<\/script>)/gi;
// 匹配css中的图片/字体资源
const REG_CSS_ASSETS = /url\(([^\)]+)\)/gi;
// 匹配_group私有属性
const REG_GROUP = /_group=["|']?([^"']+)["|']?/;

// 已收集的资源集合
const collectedAssets = {
  css: {},
  js: {}
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

const replace = (type, html, dirname, dest) => {
  let inject = {
    css: 'head',
    js: 'body'
  }[type];

  // 所要合并的碎片资源列表
  let fragments = getFragments(type, html);
  for (let name in fragments) {
    let fs = fragments[name];
    for (let f of fs) {
      // 删除碎片资源的引用标签
      html = html.replace(f.tag, '');
    }

    let file = `${dest}/${name}.${type}`;
    // 将合并后的新资源引用注入到html文档里
    html = injectAsset(html, file.replace(dirname, ''), inject);
  }

  return html;
};

// 获取所要合并的碎片列表
const getFragments = (type, html) => {
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

// 收集页面上的碎片资源
const collect = (type, html, dirname) => {
  let fragments = getFragments(type, html);
  let typeAssets = collectedAssets[type];

  for (let group in fragments) {
    let assets = fragments[group];

    if (!typeAssets[group]) typeAssets[group] = [];
    let groupAssets = typeAssets[group];

    let contains = (asset) => {
      for (let a of groupAssets) {
        if ((asset.url && asset.url === a.url) || (asset.data && asset.data === a.data)) {
          return true;
        }
      }
      return false;
    };

    for (let asset of assets) {
      contains(asset) || groupAssets.push({
        dirname: dirname,
        url: asset.url,
        data: asset.data
      });
    }
  }
};

// 按顺序合并碎片资源
const concat = (assets, dirname, type) => {
  let content = '';
  for (let asset of assets) {
    let assetDirname = dirname;
    let data = asset.data || '';

    if (asset.url) { // 外链资源，读取资源内容
      let pathname = path.join(dirname, asset.url);
      assetDirname = path.dirname(pathname);
      data = getAsset(pathname);
    }

    // 替换css中的图片/字体引用路径
    if (type === 'css') {
      data = resolvePath(data, assetDirname, dirname, REG_CSS_ASSETS);
    }

    content += data + '\n';
  }
  return content;
};

module.exports = (type, options) => {
  options = Object.assign({
    once: []
  }, options || {});
  return through2.obj((file, enc, callback) => {
    if (file.isNull()) return callback(null, file);
    collect(type, file.contents.toString(), path.dirname(file.path));
    callback(null);
  }, function(callback) {
    let typeAssets = collectedAssets[type];
    for (let group in typeAssets) {
      let groupAssets = typeAssets[group];
      let asset = concat(groupAssets, groupAssets[0].dirname, type);
      this.push(new File({
        path: `${group}.${type}`,
        contents: new Buffer(asset)
      }));
    }
    callback();
  });
};

module.exports.replace = (type, dest) => {
  return through2.obj((file, enc, callback) => {
    if (file.isNull()) return callback(null, file);
    let data = replace(type, file.contents.toString(), path.dirname(file.path), dest);
    file.contents = new Buffer(data);
    callback(null, file);
  });
};
