const iterm = require('./iterm');
iterm.getState().then(state => {
    console.log(JSON.stringify(state, null, 2));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
