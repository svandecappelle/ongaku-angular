const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');

/**
 * Receive the image of a multipart request and write it to `target`. The file is written
 * next to it and replaces it once complete. Resolves with false when the file is not an image.
 */
function receiveImage(req, target) {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers, limits: { files: 1 } });
        let saving = Promise.resolve(false);
        busboy.on('file', (fieldname, file, { mimeType }) => {
            if (!/^image\//.test(mimeType)) {
                return file.resume();
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const partial = target + '.upload';
            saving = new Promise((done, fail) => {
                file.pipe(fs.createWriteStream(partial)).on('finish', done).on('error', fail);
            }).then(() => fs.promises.rename(partial, target)).then(() => true);
        });
        busboy.on('close', () => saving.then(resolve, reject));
        busboy.on('error', reject);
        req.pipe(busboy);
    });
}

module.exports = { receiveImage };
