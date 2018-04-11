/* ## Used to plays using speakers desktop mode (plays on server side) ## */
router.get('/api/desktop-play/:media', (req, res) => {
    var play = function () {
        logger.debug("play desktop audio");

        player.desktop(req, res, library.getRelativePath(path.basename(req.params.media)));
    };
    helpers.checkingAuthorization(req, res, () => {
        play();
    });
});
router.get('/api/desktop-play/:media/stop', (req, res) => {
    var stop = function () {
        logger.debug("stop desktop audio");

        player.end(req, res);
    };
    helpers.checkingAuthorization(req, res, () => {
        stop();
    });
});

router.get('/api/desktop-play/:media/pause', (req, res) => {
    var pause = function () {
        logger.debug("stop desktop audio");

        player.pause(req, res);
    };
    helpers.checkingAuthorization(req, res, () => {
        pause();
    });
});

router.get('/api/desktop-play/:media/resume', (req, res) => {
    var resume = function () {
        logger.debug("stop desktop audio");

        player.resume(req, res);
    };
    helpers.checkingAuthorization(req, res, () => {
        resume();
    });
});