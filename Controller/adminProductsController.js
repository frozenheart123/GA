const fs = require('fs');
const path = require('path');
const Product = require('../models/product');

const IMAGE_DIR = path.join(__dirname, '..', 'public', 'images');

const resolveImagePath = (imagePath) => {
  if (!imagePath || typeof imagePath !== 'string') return null;
  if (!imagePath.startsWith('/images/')) return null;
  const relativeName = imagePath.slice('/images/'.length);
  const target = path.resolve(IMAGE_DIR, relativeName);
  if (!target.startsWith(IMAGE_DIR + path.sep) && target !== IMAGE_DIR) return null;
  return target;
};

const deleteImageIfExists = async (imagePath) => {
  const target = resolveImagePath(imagePath);
  if (!target) return;
  try {
    await fs.promises.unlink(target);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('image cleanup error:', err);
    }
  }
};

exports.dashboard = async (req, res) => {
  try {
    const { q, category } = req.query;
    const [counts, list] = await Promise.all([
      Product.counts(),
      Product.adminList({ q, category })
    ]);
    res.render('admin_products', { counts, list, q: q || '', category: category || 'All', sliderAlert: req.query.slider || '' });
  } catch (e) {
    console.error('admin products dashboard error:', e);
    res.status(500).send('Internal Server Error');
  }
};

exports.getAdd = (req, res) => {
  res.render('admin_product_form', { error: null, product: null, action: 'add' });
};

exports.postAdd = async (req, res) => {
  try{
    const { name, product_type, price, quantity, information, current_image } = req.body;
    if (!name || !product_type || !price || !quantity) {
      return res.status(400).render('admin_product_form', { error: 'Please fill required fields.', product: null, action: 'add' });
    }
    let img = null;
    if (req.file) {
      img = '/images/' + req.file.filename;
    } else if (current_image) {
      img = current_image;
    }
    await Product.create({ name, product_type, price: Number(price), quantity: Number(quantity), information, image: img });
    res.redirect('/admin/products');
  } catch (e) {
    console.error('add product error:', e);
    res.status(500).render('admin_product_form', { error: 'Internal Server Error', product: null, action: 'add' });
  }
};

exports.seed = async (req, res) => {
  try{
    await Product.seedDemo();
    res.redirect('/admin/products');
  } catch (e) {
    console.error('seed products error:', e);
    res.redirect('/admin/products');
  }
};

exports.getEdit = async (req, res) => {
  try{
    const id = req.params.id;
    const product = await Product.getById(id);
    if (!product) return res.redirect('/admin/products');
    res.render('admin_product_form', { error: null, product, action: 'edit' });
  } catch (e) {
    console.error('get edit product error:', e);
    res.redirect('/admin/products');
  }
};

exports.postEdit = async (req, res) => {
  try{
    const id = req.params.id;
    const { name, product_type, price, quantity, information, current_image } = req.body;
    let img = null;
    if (req.file) {
      img = '/images/' + req.file.filename;
    } else if (current_image) {
      img = current_image;
    }
    await Product.update(id, { name, product_type, price: Number(price), quantity: Number(quantity), information, image: img });
    if (req.file && current_image && current_image !== img) {
      await deleteImageIfExists(current_image);
    }
    res.redirect('/admin/products');
  } catch (e) {
    console.error('edit product error:', e);
    res.status(500).send('Internal Server Error');
  }
};

exports.postDelete = async (req, res) => {
  try{
    const id = req.params.id;
    const product = await Product.getById(id);
    await Product.remove(id);
    if (product && product.image) {
      await deleteImageIfExists(product.image);
    }
    res.redirect('/admin/products');
  } catch (e) {
    console.error('delete product error:', e);
    res.redirect('/admin/products');
  }
};

exports.postToggle = async (req, res) => {
  try{
    await Product.toggleAvailability(req.params.id);
    res.redirect('/admin/products');
  } catch (e) {
    console.error('toggle availability error:', e);
    res.redirect('/admin/products');
  }
};

exports.postSlider = async (req, res) => {
  try {
    const id = req.params.id;
    const enable = String(req.body.enable || '0') === '1';
    const result = await Product.setSlider(id, enable);
    if (!result.ok && result.reason === 'limit') {
      return res.redirect('/admin/products?slider=limit');
    }
    return res.redirect('/admin/products');
  } catch (e) {
    console.error('slider toggle error:', e);
    return res.redirect('/admin/products');
  }
};
