router.post('/api/user/library/add', (req, res) => {
    var username = req.session.passport.user.username,
        uids = req.body.elements;
    logger.debug("append to user lib: ".concat(username).concat(" -> ").concat(uids));

    async.each(uids, (uid, next) => {
        userlib.append(username, uid, () => {
            logger.debug("Appended to list: " + uid);
            next();
        });
    }, () => {
        logger.debug("All elements added");
    });
    res.send({ message: "ok" });
});

router.post('/api/user/library/remove', (req, res) => {
    var username = req.session.passport.user.username,
        uids = req.body.elements;
    logger.debug("remove to user lib: ".concat(username).concat(" -> ").concat(uids));

    async.each(uids, (uid, next) => {
        userlib.remove(username, uid, () => {
            logger.debug("Remove from list: " + uid);
            next();
        });
    }, () => {
        logger.debug("All elements removed");
    });
    res.send({ message: "ok" });
});
