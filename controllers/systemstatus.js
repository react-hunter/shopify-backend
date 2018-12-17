const Status = require('../models/Status');
const History = require('../models/History');

/**
 * GET /
 * System Status.
 */
exports.index = (req, res, next) => {
    
    Status.find({}, (statusErr, statusList) => {
        if (statusErr) return next(statusErr);
        
        History.find({}, null, {sort: {updatedAt: -1}, limit: 10}, (historyErr, recentHistoryList) => {
            if (historyErr) return next(historyErr);

            res.render('pages/systemstatus', {
                title: 'System Status',
                statusList: statusList,
                recentHistoryList: recentHistoryList
            });
        });
    });
};
