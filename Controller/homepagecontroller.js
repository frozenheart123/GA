// controllers/homeController.js
exports.showHomePage = (req, res) => {
  res.render("home", { title: "Mala Hot Pot Market" });
};
//done//