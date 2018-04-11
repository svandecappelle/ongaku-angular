
router.post('/api/statistics/:type/:media', (req, res) => {
    if (req.params.type === 'plays') {
        helpers.incrementPlays(req.params.media);
    }
    middleware.json(req, res, { status: "ok" });
});