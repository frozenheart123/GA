const Product = require('../models/product');

exports.getHome = async (req, res) => {
  try {
    const sliderProducts = await Product.getSliderProducts();
    const products = await Product.getPopularProducts();
    return res.render('index', { products, sliderProducts });
  } catch (err) {
    console.error('Error in home controller:', err);
    return res.status(500).send('Internal Server Error');
  }
};
