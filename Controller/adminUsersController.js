const AdminUser = require('../models/adminUser');

exports.dashboard = async (req, res) => {
  try {
    const { q, role, membership } = req.query;
    const [counts, list] = await Promise.all([
      AdminUser.counts(),
      AdminUser.list({ q, role, membership })
    ]);
    res.render('admin_users', { counts, list, q: q || '', role: role || 'All', membership: membership || 'All' });
  } catch (e) {
    console.error('admin users dashboard error:', e);
    res.status(500).send('Internal Server Error');
  }
};

exports.getAdd = (req, res) => {
  res.render('admin_user_form', { error: null, user: null, action: 'add' });
};

exports.postAdd = async (req, res) => {
  try{
    const { name, address, contact_number, role, password } = req.body;
    if (!name || !password) return res.status(400).render('admin_user_form', { error: 'Name and password required', user: null, action: 'add' });
    await AdminUser.create({ name, address, contact_number, role, password });
    res.redirect('/admin/users');
  } catch (e) { console.error('add user error:', e); res.status(500).render('admin_user_form', { error: 'Internal Server Error', user: null, action: 'add' }); }
};

exports.getEdit = async (req, res) => {
  try{
    const user = await AdminUser.getById(req.params.id);
    if (!user) return res.redirect('/admin/users');
    res.render('admin_user_form', { error: null, user, action: 'edit' });
  } catch (e) { console.error('get edit user error:', e); res.redirect('/admin/users'); }
};

exports.postEdit = async (req, res) => {
  try{
    const { name, address, contact_number, role } = req.body;
    await AdminUser.update({ user_id: req.params.id, name, address, contact_number, role });
    res.redirect('/admin/users');
  } catch (e) { console.error('edit user error:', e); res.status(500).send('Internal Server Error'); }
};

exports.postResetPw = async (req, res) => {
  try{
    await AdminUser.resetPassword(req.params.id, req.body.password || 'changeme123');
    res.redirect('/admin/users');
  } catch (e) { console.error('reset pw error:', e); res.redirect('/admin/users'); }
};

exports.postMakeMember = async (req, res) => {
  try{
    const { plan_id, days } = req.body;
    await AdminUser.makeMember({ user_id: req.params.id, plan_id: plan_id || null, days: days || 365 });
    res.redirect('/admin/users');
  } catch (e) { console.error('make member error:', e); res.redirect('/admin/users'); }
};

exports.postClearMember = async (req, res) => {
  try{
    await AdminUser.clearMember(req.params.id);
    res.redirect('/admin/users');
  } catch (e) { console.error('clear member error:', e); res.redirect('/admin/users'); }
};
