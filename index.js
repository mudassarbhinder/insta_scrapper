const cheerio = require("cheerio");
// const puppeteer = require("puppeteer");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const fs = require("fs").promises;
const {
  PuppeteerPendingRequests,
} = require("@agabhane/puppeteer-pending-requests");
const { resolve } = require("path");
const { Parser } = require("json2csv");

/**puppeteer browser starter */
async function get_browser() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      //   "--blink-settings=imagesEnabled=false",
    ],
  });

  return browser;
}
/**open tab */
async function get_page(browser) {
  var page = await browser.newPage();
  page.on("dialog", async (dialog) => {
    console.log("Alter Box closed");
    await dialog.dismiss();
  });
  await page.setDefaultTimeout(300 * 1000);
  await page.setDefaultNavigationTimeout(300 * 1000);
  await page.setViewport({ width: 1280, height: 800 }); //await page.setViewport({ width: 1440, height: 870 });

  return page;
}
/**Starting function*/
const main_funct = async () => {
  let browser = await get_browser();
  let page = await get_page(browser);
  let jsonoutput = [];
  puppeteerPendingRequests = await new PuppeteerPendingRequests(page);
  try {
    //Login if needed
    // await login(page);
    //["https://www.instagram.com/p/CapOCL8MSeB/"];

    //get specific account urls
    let post_urls = await get_posts_urls(
      page,
      "https://www.instagram.com/chanelofficial/?hl=en",
      100
    );

    for (p_url of post_urls) {
      try {
        let row = await get_post_details(page, p_url);
        console.log(row);
        jsonoutput.push(row);
        //save file as csv after converting json object to csv string
        const json2csvParser = new Parser();
        const out_csv_string = json2csvParser.parse(jsonoutput);
        await fs.writeFile(resolve(__dirname, "InstaData.csv"), out_csv_string);
      } catch (e) {}
    }

    await puppeteerPendingRequests.waitForNetworkIdle(1000 * 2.5);

    //----------------------------------------------------------------------------------------------------------------
    // end of main fucntion
  } catch (err) {
    try {
      await browser.close();
    } catch (e) {}
  } finally {
    try {
      await browser.close();
    } catch (e) {}
  }
};

async function get_posts_urls(page, user_url, max = -1) {
  let post_urls = [];
  let load_more_fails = 0;
  await page.goto(user_url, {
    waitUntil: "networkidle0",
  });
  await puppeteerPendingRequests.waitForNetworkIdle(1000 * 20);

  //loop will load all posts
  do {
    // will break if fails to load more 5 times assuming if posts are ended

    if (load_more_fails > 5) {
      break;
    }

    let cnt_new = 0;
    let doc = cheerio.load(await page.content());
    let post_elems = doc(
      "article[class='ySN3v'] div[class='Nnq7C weEfm'] div[class='v1Nh3 kIKUG _bz0w'] > a[href]"
    );

    post_elems.each((i, el) => {
      let post_url = "https://www.instagram.com" + doc(el).attr("href").trim();
      if (!post_urls.includes(post_url)) {
        post_urls.push(post_url);
        cnt_new++;
      }
    });
    console.log("Post elems found", post_elems.length);
    console.log("Post urls total", post_urls.length);

    if (cnt_new == 0) {
      load_more_fails++;
    }

    if (max > -1 && post_urls.length > max) {
      break;
    }
    // scrole to last post to load more posts
    await page.evaluate(() => {
      let els = document.querySelectorAll(
        "article[class='ySN3v'] div[class='Nnq7C weEfm'] div[class='v1Nh3 kIKUG _bz0w']"
      );
      if (els.length > 0) {
        els.item(0).scrollIntoView();
        els.item(els.length - 1).scrollIntoView();
      }
    });

    await page.waitForTimeout(10000);
  } while (true);

  return post_urls;
}

async function get_post_details(page, post_url) {
  await page.goto(post_url, {
    waitUntil: "networkidle0",
  });
  await puppeteerPendingRequests.waitForNetworkIdle(1000 * 10);

  while (true) {
    if (
      await page.evaluate(() => {
        try {
          document
            .querySelector("div[class='EcJQs'] button[aria-label='Next']")
            .click();
          return true;
        } catch (error) {
          return false;
        }
      })
    ) {
      console.log("Next Image clicked");
      await page.waitForTimeout(2000);
    } else {
      break;
    }
  }

  let html = await page.content();
  // console.log(html);
  let $ = cheerio.load(html);

  let post_date = $("a[class='c-Yi7'] time[datetime]")
    .first()
    .attr("datetime")
    .trim()
    .split("T")[0];
  let media_urls = [];
  //[role='presentation'] div[class='KL4Bh']  > img[src]
  //ul[class='vi798'] li div[class='KL4Bh'] > img[src]
  //[role='presentation'] div[class='_97aPb   wKWK0']  img[src]
  //video.tWeCl
  $("[role='presentation'] div[class='_97aPb   wKWK0']  img[src]").each(
    (i, el) => {
      media_urls.push($(el).attr("src"));
    }
  );
  let cnt_likes = $(
    "div[class='_7UhW9   xLCgt        qyrsm KV-D4              fDxYl    T0kll '] > span"
  )
    .first()
    .text();
  //   console.log(post_url);
  //   console.log(post_date);
  //   console.log(cnt_likes);
  //   console.log(media_urls);

  return { post_url, post_date, cnt_likes, media_urls: media_urls.join(", ") };
}

const login = async (page) => {
  await page.goto("https://www.instagram.com/accounts/login", {
    waitUntil: "networkidle0",
  });

  let puppeteerPendingRequests = await new PuppeteerPendingRequests(page);
  await puppeteerPendingRequests.waitForNetworkIdle(1000 * 2.5);
  await page.waitForTimeout(1000 * 3);
  //TODO: add user name and password
  await page.type("[name='username']", "username", {
    delay: 100,
  });
  await page.type("[name='password']", "password", {
    delay: 100,
  });
  await page.click("button[type='submit']");
  console.log("Login Url Loaded");
};

(async () => {
  await main_funct();
  console.log("Ended");
})();
