const _ = require("underscore");
const async = require("async");
const rp = require('request-promise');


class WikipediaConnector {

  getArtistInfo(artist) {
    let searchTerm = `${artist.artist}`.toLowerCase();
    return new Promise((resolve, reject) => {
      rp.get('https://fr.wikipedia.org/w/api.php', {
        qs: {
          action: "query",
          list: 'search',
          srsearch: searchTerm,
          srwhat: 'text',
          srprop: 'titlesnippet|snippet|hasrelated',
          format: "json",
          formatversion: 2
        },
        json: true
      }).then(pages => {
        var count = 0;
        async.doWhilst((next) => {
          let page = pages.query.search[count];
          count += 1;
          rp.get('https://fr.wikipedia.org/w/api.php', {
            qs: {
              action: "query",
              prop: 'categories|extracts',
              titles: page.title,
              format: "json",
              pslimit: 100,
              formatversion: 2
            },
            json: true
          }).then((detailPage) => {
            let musicCategory = _.filter(detailPage.query.pages[
              0].categories, (
              category) => {
              let categoryTitle = category.title.toLowerCase();
              let isMusic = false;

              let musicTerms = require(
                './music_terms.json');
              for (let index = 0; index < musicTerms.length; index++) {
                const element = musicTerms[index];
                if (categoryTitle.indexOf(element) !== -1) {
                  console.debug(`Found with: ${element} matched with: ${categoryTitle}`);
                  return true;
                }
              }
              return false;
            });
            if (musicCategory && musicCategory.length > 0) {
              artist.wikipedia = detailPage.query.pages[0].extract;
            }

            next(null, musicCategory && musicCategory.length >
              0);
            return 0;
          }).catch(error => {
            console.error(error);
          });
        }, (found, err) => {
          return count < pages.query.search.length - 1 && !found;
        }, () => {
          resolve();
        });
      }).catch((error) => {
        console.error("wikipedia error", error);
        reject(error);
      });
    });
  }
}

module.exports = new WikipediaConnector();
