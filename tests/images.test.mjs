// Unit tests of the image library helpers and of the Markdown rules for images (no browser needed).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findImage, imageKey, imageName, isExternalSource, replaceImages, sanitizeImages } from '../src/images.js';
import { md, updateImageAttributes } from '../src/markdown.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'/%3e";

test('only the file name of a path counts, case-insensitively', () => {
  assert.equal(imageKey('./img/My%20Schema.PNG'), 'my schema.png');
  assert.equal(imageKey('C:%5Cdocs%5Cicon.svg'), 'icon.svg');
  assert.equal(imageKey('C:\\docs\\Photos\\Team.JPG'), 'team.jpg');
  assert.equal(imageKey('../assets/logo.png?v=3#top'), 'logo.png');
  assert.equal(imageKey('photo.png'), 'photo.png');
  assert.equal(imageName('./img/My%20Schema.PNG'), 'My Schema.PNG');
  assert.equal(imageKey('broken%ZZname.png'), 'broken%zzname.png');
  assert.equal(imageKey('folder/'), '');
});

test('remote and inline sources are left to the browser', () => {
  assert.equal(isExternalSource('https://example.com/a.png'), true);
  assert.equal(isExternalSource('//cdn.example.com/a.png'), true);
  assert.equal(isExternalSource(PNG), true);
  assert.equal(isExternalSource('C:\\docs\\a.png'), false);
  assert.equal(isExternalSource('img/a.png'), false);
});

test('sanitizeImages keeps valid images only', () => {
  const images = sanitizeImages({
    'folder/Photo.png': PNG,
    'icon.svg': SVG,
    'script.png': 'javascript:alert(1)',
    'page.html': 'data:text/html;base64,PGI+',
    [`${'x'.repeat(250)}.png`]: PNG,
    'number.png': 42,
  });
  assert.deepEqual(
    images.map(image => [image.key, image.name]),
    [
      ['photo.png', 'Photo.png'],
      ['icon.svg', 'icon.svg'],
    ],
  );
  assert.equal(images[0].bytes, 9);
  assert.deepEqual(sanitizeImages(null), []);
  assert.deepEqual(sanitizeImages('nope'), []);
  assert.equal(sanitizeImages([{ name: 'a.png', dataUrl: PNG }]).length, 1);
});

test('images resolve by name, or show what is missing', async () => {
  await replaceImages(sanitizeImages({ 'Schema.png': PNG }), { persist: false });
  assert.equal(findImage('any/where/SCHEMA.PNG').dataUrl, PNG);
  const html = md.render(
    '![Plan](./docs/img/schema.png)\n\n![Other](C:\\\\x\\\\absent.png) and ![Web](https://example.com/w.png)',
  );
  assert.match(
    html,
    /<span class="document-image is-block" data-line="0" data-line-end="1" data-index="0"><img src="data:image\/png;base64,iVBORw0KGgo=" alt="Plan"><\/span>/,
  );
  assert.match(html, /<span class="image-missing" data-image="absent.png">Missing image: absent.png<\/span>/);
  assert.match(
    html,
    /<span class="document-image" data-line="2" data-line-end="3" data-index="1"><img src="https:\/\/example.com\/w.png" alt="Web"><\/span>/,
  );
  await replaceImages([], { persist: false });
  assert.match(md.render('![Plan](schema.png)'), /Missing image: schema.png/);
});

test('attributes in braces size and align an image and leave no text behind', async () => {
  await replaceImages(sanitizeImages({ 'a.png': PNG }), { persist: false });
  const html = md.render('![A](a.png){width=60% align=right}\n\nText ![A](a.png){width=20mm} end {not attributes}.');
  assert.match(html, /class="document-image is-sized is-block"[^>]*style="--image-width: 60%" data-align="right"/);
  assert.match(
    html,
    /class="document-image is-sized" data-line="2" data-line-end="3" data-index="0" style="--image-width: 20mm">/,
  );
  assert.doesNotMatch(html, /\{width/);
  assert.match(html, /end \{not attributes\}\./);
  // Invalid values are dropped, the braces are still consumed.
  assert.match(
    md.render('![A](a.png){width=huge onclick=x}'),
    /<p><span class="document-image is-block"[^>]*><img[^>]*><\/span><\/p>/,
  );
  await replaceImages([], { persist: false });
});

test('updateImageAttributes rewrites the right image of the right block', () => {
  const source = 'Intro.\n\nOne ![a](a.png) two ![b](img/b.png){width=30% .wide} three.\n\n![c](c.png)\n';
  assert.equal(
    updateImageAttributes(source, 2, 3, 0, { width: '50%' }),
    'Intro.\n\nOne ![a](a.png){width=50%} two ![b](img/b.png){width=30% .wide} three.\n\n![c](c.png)\n',
  );
  assert.equal(
    updateImageAttributes(source, 2, 3, 1, { width: null, align: 'left' }),
    'Intro.\n\nOne ![a](a.png) two ![b](img/b.png){.wide align=left} three.\n\n![c](c.png)\n',
  );
  assert.equal(
    updateImageAttributes(source, 4, 5, 0, { width: '75%' }),
    source.replace('![c](c.png)', '![c](c.png){width=75%}'),
  );
  // Removing the last attribute removes the braces.
  assert.equal(updateImageAttributes('![a](a.png){width=40%}', 0, 1, 0, { width: null }), '![a](a.png)');
  // Out of range: unchanged.
  assert.equal(updateImageAttributes(source, 2, 3, 5, { width: '50%' }), source);
  assert.equal(updateImageAttributes(source, 40, 41, 0, { width: '50%' }), source);
});

test('updateImageAttributes skips code, escapes and handles nesting and references', () => {
  assert.equal(
    updateImageAttributes('Code `![x](x.png)` and \\![y](y.png) then ![z](z.png)', 0, 1, 0, { width: '50%' }),
    'Code `![x](x.png)` and \\![y](y.png) then ![z](z.png){width=50%}',
  );
  assert.equal(
    updateImageAttributes('![alt [nested]](path/(1).png "Title")', 0, 1, 0, { width: '50%' }),
    '![alt [nested]](path/(1).png "Title"){width=50%}',
  );
  assert.equal(
    updateImageAttributes('![Logo][brand] and ![brand]\n\n[brand]: logo.png', 0, 1, 1, { width: '25%' }),
    '![Logo][brand] and ![brand]{width=25%}\n\n[brand]: logo.png',
  );
  assert.equal(
    updateImageAttributes('> quote ![a](a.png)\n> more ![b](b.png)', 0, 2, 1, { align: 'center' }),
    '> quote ![a](a.png)\n> more ![b](b.png){align=center}',
  );
  assert.equal(updateImageAttributes('![a](a.png)\r\n', 0, 1, 0, { width: '50%' }), '![a](a.png){width=50%}\r\n');
});
