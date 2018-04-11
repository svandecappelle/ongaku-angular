
router.get('/api/video/library/:page', (req, res) => {
    // load by page of 3 artists.
    logger.debug("Get all one page of library ".concat(req.params.page));
    var libraryDatas = library.getVideo(req.params.page, 9);
    middleware.json(req, res, libraryDatas);
});

router.get('/api/video/library', (req, res) => {
    logger.debug("Get all video library");
    var libraryDatas = library.getVideo();
    middleware.json(req, res, libraryDatas);
});


router.get('/api/video/stream/:media', (req, res) => {
    // ".ogg": "video/ogg
    // to convert to ogv
    // ffmpeg -i demoreel.mp4 -c:v libtheora -c:a libvorbis demoreel.ogv

    // To webm
    // ffmpeg -i "fichier source" -codec:v libvpx -quality good -cpu-used 0 -b:v 500k -r 25 -qmin 10 -qmax 42 -maxrate 800k -bufsize 1600k -threads 4 -vf scale=-1:360 -an -pass 1 -f webm /dev/null
    // ffmpeg -i "fichier source" -codec:v libvpx -quality good -cpu-used 0 -b:v 500k -r 25 -qmin 10 -qmax 42 -maxrate 800k -bufsize 1600k -threads 4 -vf scale=-1:360 -codec:a libvorbis -b:a 128k -pass 2 -f webm sortie.webm
    var stream = function () {
        logger.debug("streaming video");
        middleware.stream(req, res, req.params.media, "video");
    };

    meta.settings.getOne("global", "videoStream", (err, value) => {
        if (value === 'true') {
            helpers.checkingAuthorization(req, res, function () {
                stream();
            });
        } else {
            res.json({
                error: 'Operation not allowed',
                code: 403
            });
        }
    });
});

router.get('/api/video/library/filter/:search/:page', (req, res) => {
    logger.debug("Search filtering video library");
    var groupby = req.session.groupby ? req.session.groupby : DEFAULT_GROUP_BY;

    var libraryDatas;
    var opts = {
        filter: req.params.search,
        type: 'video',
        groupby: groupby
    };
    if (req.params.page === "all") {
        libraryDatas = library.search(opts);
    } else {
        opts.page = req.params.page;
        opts.lenght = 3;
        libraryDatas = library.searchPage(opts);
    }

    middleware.json(req, res, libraryDatas);
});