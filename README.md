# gulp-collector

> 收集静态页面上的静态资源引用

```bash
npm install --save-dev @tools/gulp-collector
```

页面中引用：
```html
<!-- index.html -->
<link rel="stylesheet" href="./reset.css" _group="base">
<link rel="stylesheet" href="./index.css" _group="index">
<script type="text/javascript" src="/assets/js/lib/jquery.js" _group="base"></script>
<script type="text/javascript" src="/assets/js/common.js" _group="base"></script>
<script type="text/javascript" src="./index.js" _group="index"></script>
```

Gulpfile.js中定义`collector`任务：
```javascript
/**
 * 收集静态资源文件引用，按script/link标签的_group私有属性收集
 * _group私有属性指定的就是收集后的文件名
 */
const collector = require('@tools/collector');
gulp.task('collector', () => {
  return gulp.src(['./build/*.html'])
  .pipe(collector('js', 'assets/js'))
  .pipe(collector('css', 'assets/css'))
  .pipe(gulp.dest('./build'));
});
```

控制台运行：
```bash
gulp collector
```

执行完毕后，在`./build/assets`目录下将会生成以下4个文件：
* base.css
* index.css
* base.js
* index.js

此时的`index.html`中代码变成这样：
```html
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/index.css">
<script type="text/javascript" src="/assets/js/base.js"></script>
<script type="text/javascript" src="/assets/js/index.js"></script>
```
