import { createHighlighter } from "shiki";

export default async function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy('assets/css/*');
  eleventyConfig.addPassthroughCopy('assets/type/*');

  eleventyConfig.addLayoutAlias('default', 'layouts/default');

  eleventyConfig.addCollection('articles', collectionsApi => {
    return collectionsApi
      .getAll()
      .filter(item => !item.data.draft);
  });

  /* https://claas.dev/posts/shiki-with-eleventy/ */
  eleventyConfig.addPlugin(
    shikiPlugin,
    {
      theme: "github-dark-high-contrast",
      themes: ["github-dark-high-contrast"],

      langs: [
        "bash",
        "html",
        "toml",
        "rust",
        "kotlin",
        "js",
        "ts",
        "c",
      ],
    }
  );

};

async function shikiPlugin(configuration, options) {
  const highlighter = await createHighlighter(options);
  configuration.amendLibrary("md", (library) => {
    library.set({
      highlight: (code, language) => {
        return highlighter.codeToHtml(code, {
          lang: language,
          theme: options.theme,
        });
      },
    });
  });
};
