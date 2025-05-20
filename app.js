const courses = [
  { title: 'Introduction to Deep Learning', provider: 'MIT' },
  { title: 'Artificial Intelligence', provider: 'MIT' },
  { title: 'Machine Learning', provider: 'Stanford' },
  { title: 'Deep Learning Specialization', provider: 'Coursera' },
  { title: 'Practical Deep Learning for Coders', provider: 'Fast.ai' }
];

const listEl = document.getElementById('course-list');
const filterEl = document.getElementById('filter');
const sortEl = document.getElementById('sort');

function render() {
  const filter = filterEl.value;
  const sortKey = sortEl.value;

  let filtered = filter === 'all' ? courses : courses.filter(c => c.provider === filter);

  filtered = filtered.slice().sort((a, b) => {
    if (a[sortKey] < b[sortKey]) return -1;
    if (a[sortKey] > b[sortKey]) return 1;
    return 0;
  });

  listEl.innerHTML = '';
  for (const course of filtered) {
    const li = document.createElement('li');
    li.textContent = `${course.title} - ${course.provider}`;
    listEl.appendChild(li);
  }
}

filterEl.addEventListener('change', render);
sortEl.addEventListener('change', render);

render();
