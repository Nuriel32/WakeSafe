const express = require('express');
const auth = require('../middlewares/auth');
const spotifyController = require('../controllers/spotifyController');

const router = express.Router();

router.get('/callback', spotifyController.callback);
router.get('/login', auth, spotifyController.login);
router.get('/login-url', auth, spotifyController.getLoginUrl);
router.get('/status', auth, spotifyController.connectionStatus);
router.get('/me', auth, spotifyController.me);
router.get('/playlists', auth, spotifyController.playlists);
router.get('/playlists/:id', auth, spotifyController.playlistTracks);
router.get('/player/current', auth, spotifyController.currentPlayback);
router.put('/player/play', auth, spotifyController.play);
router.put('/player/pause', auth, spotifyController.pause);
router.post('/player/next', auth, spotifyController.next);
router.post('/player/previous', auth, spotifyController.previous);

module.exports = router;
