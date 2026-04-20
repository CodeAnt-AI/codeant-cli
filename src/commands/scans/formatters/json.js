export default {
  name: 'json',
  mime: 'application/json',
  extension: '.json',
  render(envelope) {
    return JSON.stringify(envelope, null, 2);
  },
};
