const Product = require('../models/product');

exports.getHome = async (req, res) => {
  try {
    const products = await Product.getPopularProducts();
    return res.render('index', { products });
  } catch (err) {
    console.error('Error in home controller:', err);
    return res.status(500).send('Internal Server Error');
  }
};