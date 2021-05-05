import cld from "cld";
import fetch from "node-fetch";

const feedName = process.argv[2] || "welcome";

loadFeed(feedName).then(
  (result) => {
    console.log(result.length, "posts analyzed");
    let totalBytes = 0;
    const langStat = {};
    for (const { textBytes, stat } of result) {
      totalBytes += textBytes;
      for (const lang of Object.keys(stat)) {
        langStat[lang] = (langStat[lang] || 0) + textBytes * stat[lang];
      }
    }
    for (const lang of Object.keys(langStat)) {
      langStat[lang] /= totalBytes;
    }

    console.log(`Total stat of @${feedName}:`, langStat);
  },
  (err) => console.log(err)
);

async function loadFeed(feedName) {
  const response = await fetch(
    "https://freefeed.net/v2/timelines/" + encodeURIComponent(feedName)
  );
  if (!response.ok) {
    throw new Error("Cannot load feed " + feedName);
  }

  const { posts } = await response.json();

  return Promise.all(
    posts.map(async (post) => {
      const res = await loadPost(post.id);
      console.log(`https://freefeed.net/${feedName}/${post.id}`, res.stat);
      return res;
    })
  );
}

async function loadPost(id) {
  const response = await fetch(
    `https://freefeed.net/v2/posts/${id}?maxComments=all`
  );
  if (!response.ok) {
    throw new Error("Cannot load post " + id);
  }

  const {
    posts: { body },
    comments,
  } = await response.json();

  const stat = await Promise.all(
    [body, ...comments.map((c) => c.body)].map(async (text) => {
      try {
        const { reliable, textBytes, languages } = await cld.detect(text);
        // console.log(text, languages);
        return reliable ? { textBytes, languages } : null;
      } catch (err) {
        // console.log(err.message, text);
      }
      return null;
    })
  );

  // console.dir(stat.filter(Boolean), { depth: 3 });

  let totalBytes = 0;
  const langStat = {};
  for (const { textBytes, languages } of stat.filter(Boolean)) {
    totalBytes += textBytes;
    for (const lang of languages) {
      langStat[lang.code] =
        (langStat[lang.code] || 0) + textBytes * lang.percent;
    }
  }

  for (const lang of Object.keys(langStat)) {
    langStat[lang] /= totalBytes * 100;
  }

  return { stat: langStat, textBytes: totalBytes };
}
