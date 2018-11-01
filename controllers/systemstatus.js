/**
 * GET /
 * System Status.
 */
exports.index = (req, res) => {
    res.render('pages/systemstatus', {
        title: 'System Status'
    });
};
