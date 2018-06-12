const express = require('express');
const middleware = require("./../../middleware/middleware");

const statistics = require("./../../model/statistics");
var router = express.Router();

class Helpers {

    incrementPlays(mediauid, userSession) {
        if (mediauid) {
            mediauid = mediauid.replace(".mp3", '');
            statistics.set('plays', mediauid, 'increment', () => {
                logger.info(`set statistics: ${mediauid}`);
            });
            var media = library.getByUid(mediauid);
            logger.debug(media);
            var genre = media.metadatas.genre ? media.metadatas.genre : media.metadatas.GENRE;
            if (genre) {
                statistics.set('plays-genre', genre, 'increment', () => {
                    logger.debug("set statistics");
                });
            }
            // TODO communication change this.
            /*communication.emit(userSession, 'streaming-playing:started', {
                uuid: mediauid,
                encoding: library.getAudioById(mediauid).encoding
            });*/
        }
    }
}

var helpers = new Helpers();

router.post('/:type/:media', (req, res) => {
    if (req.params.type === 'plays') {
        helpers.incrementPlays(req.params.media);
    }
    middleware.json(req, res, { status: "ok" });
});

module.exports = router;