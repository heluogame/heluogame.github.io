'use strict';

const pagination = require('hexo-pagination');

function normalizeRoute(value) {
  return String(value || '')
    .split('#')[0]
    .split('?')[0]
    .replace(/^\/+|\/+$/g, '');
}

function getPrimaryCategoryRoute(menu, categories) {
  const entries = Object.entries(menu || {});

  for (const [, value] of entries) {
    if (typeof value !== 'string') continue;
    const route = normalizeRoute(value.split('||')[0].trim());
    if (categories.some(category => category.length && normalizeRoute(category.path) === route)) return route;
  }

  return null;
}

function hasCategoryRoute(post, route) {
  const categories = post.categories && post.categories.data ? post.categories.data : [];
  return categories.some(category => normalizeRoute(category.path) === route);
}

hexo.extend.generator.register('index', function homeSectionIndexGenerator(locals) {
  const config = this.config;
  const categories = locals.categories && locals.categories.data ? locals.categories.data : [];
  const primaryCategoryRoute = getPrimaryCategoryRoute(this.theme && this.theme.config && this.theme.config.menu, categories);
  const posts = (primaryCategoryRoute
    ? locals.posts.filter(post => hasCategoryRoute(post, primaryCategoryRoute))
    : locals.posts).sort(config.index_generator.order_by);

  posts.data.sort((a, b) => (b.sticky || 0) - (a.sticky || 0));

  const paginationDir = config.pagination_dir || 'page';
  const path = config.index_generator.path || '';

  return pagination(path, posts, {
    perPage: config.index_generator.per_page,
    layout: ['index', 'archive'],
    format: `${paginationDir}/%d/`,
    data: { __index: true }
  });
});
