const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const Debug = require('debug');
const _ = require('lodash');
const axios = require('axios').default;
const TelegramBot = require('node-telegram-bot-api');

const debug = Debug('main');

const ombiUrl = process.env.OMBI_URL;
const ombiToken = process.env.OMBI_TOKEN;
const telegramToken = process.env.TELEGRAM_TOKEN;
const channelId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(telegramToken, {polling: true});

const app = express();

app.use(morgan('combined'));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const sendReponse = (url, requestId) => {
    return axios.put(url, {
        id: parseInt(requestId),
    }, {
        headers: {
            ApiKey: ombiToken,
        },
    });
};

const getChildRequests = requestId => {
    return axios.get(`${ombiUrl}/api/v1/Request/tv/${requestId}/child`, {
        headers: {
            ApiKey: ombiToken,
        },
    });
};

const respondTv = (action, requestId) => {
    return getChildRequests(requestId).then(res => {
        return Promise.all(res.data.map(child => {
            const url = `${ombiUrl}/api/v1/Request/tv/${action}`;
            return sendReponse(url, child.id).catch(err => console.error(err));
        }));
    }).catch(err => console.error(err));
};

const respondMovie = (action, requestId) => {
    const url = `${ombiUrl}/api/v1/Request/movie/${action}`;
    return sendReponse(url, requestId).catch(err => console.error(err));
};

bot.on('callback_query', query => {
    console.log('query', query);
    if (query && query.data) {
        const [action, type, requestId] = query.data.split(':');
        if (action && type && requestId) {
            switch (type) {
                case 'tv':
                    respondTv(action, requestId).then(res => {
                        bot.sendMessage(channelId, action === 'approve' ? 'Request Approved' : 'Request Denied');
                    }).catch(err => console.error(err));
                    break;
                case 'movie':
                    respondMovie(action, requestId).then(res => {
                        bot.sendMessage(channelId, action === 'approve' ? 'Request Approved' : 'Request Denied');
                    }).catch(err => console.error(err));
                    break;
            }
        }
    }
});

app.all('*', (req, res) => {
    debug('req', req.body);
    const notificationType = _.get(req.body, 'notificationType', '');
    switch (notificationType) {
        case 'NewRequest':
            let message;
            let type;

            if (req.body.type.toLowerCase() === 'movie') {
                message = `Movie ${req.body.title}(${req.body.year}) has been requested by ${req.body.requestedUser}.`
                type = 'movie';
            }

            if (req.body.type.toLowerCase() === 'tv show') {
                const episodeList = req.body.episodesList.split(',');
                message = `${episodeList.length} episodes of TV Show ${req.body.title}(${req.body.year}) has been requested by ${req.body.requestedUser}.`;
                type = 'tv';
            }

            if (message) {
                bot.sendMessage(channelId, message, {
                    "reply_markup": {
                        "inline_keyboard": [
                            [{
                                text: "Approve",
                                callback_data: `approve:${type}:${req.body.requestId}`,
                            },
                            {
                                text: "Deny",
                                callback_data: `deny:${type}:${req.body.requestId}`,
                            }],
                        ]
                    }
                });
            }
            break;
    }
    res.json({});
});

const port = process.env.PORT || 4322;
const server = app.listen(port, () => {
  debug(`Starting up on port ${port}...`);
});

process
  .on('uncaughtException', (err, origin) => {
    console.error('Uncaught Exception', err, origin);
    process.exit(1);
  })
  .on('exit', (code) => {
    process.exit(code);
  })
  .on('SIGINT', () => {
      process.exit(0);
  });
