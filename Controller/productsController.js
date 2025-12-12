const Product = require('../models/product');

exports.getMenu = async (req, res) => {
  try {
    const { type, min, max } = req.query;
    const filters = {
      type: type || undefined,
      minPrice: min !== undefined && min !== '' ? Number(min) : undefined,
      maxPrice: max !== undefined && max !== '' ? Number(max) : undefined,
    };
    const products = await Product.getAll(filters);
    res.render('menu', { products, selected: { type: filters.type, min, max } });
  } catch (err) {
    console.error('Error rendering menu:', err);
    res.status(500).send('Internal Server Error');
  }
};
