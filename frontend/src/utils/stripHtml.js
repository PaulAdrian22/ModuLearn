export const stripHtmlTags = (html) => {
  if (typeof html !== 'string') return '';

  // Create a temporary DOM element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Get text content which automatically decodes entities and removes tags
  return temp.textContent || temp.innerText || '';
};
