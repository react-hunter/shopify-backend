/**
 * GET /
 * Reports Page.
 */
exports.index = (req, res) => {
    res.render('pages/reports', {
        title: 'Reports'
    });
};
