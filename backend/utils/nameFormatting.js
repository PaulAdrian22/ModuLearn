const formatFullName = (value = '') => {
  return String(value || '').replace(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g, (word) => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
};

module.exports = {
  formatFullName
};
