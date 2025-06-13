export default async function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy('assets/css/*');
  eleventyConfig.addPassthroughCopy('assets/type/*');

  eleventyConfig.addCollection('articles', collectionsApi => {
    return collectionsApi
      .getAll()
      .filter(item => !item.data.draft);
  });

};

