const MembershipPlan = require('../models/membershipPlan');
const UserModel = require('../models/user');

exports.getMembership = async (req, res) => {
  try {
    const plans = await MembershipPlan.getActivePlans();
    const joined = req.query.joined === '1';
    res.render('membership', { plans, joined });
  } catch (err) {
    console.error('Error loading membership plans:', err);
    res.status(500).send('Internal Server Error');
  }
};

exports.joinMembership = async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  try {
    await UserModel.setMembershipStatus({ user_id: req.session.user.user_id, is_member: 1 });
    req.session.user.is_member = 1;
    res.redirect('/membership?joined=1');
  } catch (err) {
    console.error('joinMembership error:', err);
    res.status(500).send('Unable to activate membership');
  }
};
