import app from '../../api-express/index.js';

export default function handler(req, res) {
  return app(req, res);
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
