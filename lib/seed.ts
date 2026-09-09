import type { Database, Submission } from "./types";
import { hashPassword } from "./security";

export function emptyDatabase(): Database {
  return {
    users: [],
    groups: [],
    assignments: [],
    submissions: [],
    files: [],
    lessons: [],
    invites: [],
    sessions: [],
    loginAttempts: [],
  };
}
export function createSeed(): Database {
  const db = emptyDatabase();
  const now = new Date();
  const date = (days: number, hour = 18) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const passwordHash = hashPassword("MetaEducation2026!");
  db.users = [
    {
      id: "teacher",
      name: "Анна Сергеевна",
      email: "teacher@meta-education.demo",
      role: "teacher",
      passwordHash,
      color: "green",
      createdAt: date(-90),
    },
    ...[
      ["Александра Морозова", "sasha", "peach"],
      ["Михаил Соколов", "misha", "blue"],
      ["Дарья Волкова", "dasha", "pink"],
      ["Артём Козлов", "artem", "sage"],
      ["София Лебедева", "sofia", "purple"],
      ["Иван Новиков", "ivan", "sand"],
      ["Полина Смирнова", "polina", "blue"],
      ["Максим Орлов", "maxim", "peach"],
    ].map(([name, login, color], i) => ({
      id: `student-${i + 1}`,
      name,
      email: `${login}@meta-education.demo`,
      role: "student" as const,
      passwordHash,
      color,
      createdAt: date(-70 + i),
    })),
  ];
  db.groups = [
    {
      id: "group-1",
      name: "Профиль · 90+",
      description: "Углублённая подготовка к ЕГЭ по математике",
      color: "green",
      studentIds: ["student-1", "student-2", "student-3", "student-4"],
    },
    {
      id: "group-2",
      name: "Профиль · 70+",
      description: "Уверенный результат и разбор сложных тем",
      color: "peach",
      studentIds: ["student-5", "student-6", "student-7", "student-8"],
    },
    {
      id: "group-3",
      name: "Индивидуальные",
      description: "Занятия в своём темпе",
      color: "purple",
      studentIds: ["student-1", "student-5"],
    },
  ];
  const titles = [
    "Производная и её применение",
    "Планиметрия. Окружность",
    "Пробный вариант ЕГЭ",
    "Логарифмические уравнения",
    "Теория вероятностей",
    "Стереометрия. Призмы",
    "Тригонометрические уравнения",
    "Преобразование выражений",
  ];
  const descriptions = [
    "Повторите правила дифференцирования.\n1. Найдите производную функции f(x) = 3x⁴ − 2x² + 7.\n2. Найдите точки экстремума функции y = x³ − 12x.\n3. Исследуйте функцию y = x² − 6x + 5 и найдите её наименьшее значение на отрезке [0; 5].\nВ заданиях с развёрнутым ответом приложите полное решение.",
    "Решите задания на свойства вписанных углов и касательных.\n1. Центральный угол равен 124°. Найдите вписанный угол, опирающийся на ту же дугу.\n2. Из точки A к окружности проведены касательные AB и AC. AB = 12. Найдите AC.\n3. Докажите, что угол между касательной и хордой равен половине соответствующей дуги.",
    "Пробная работа по темам первой и второй части ЕГЭ.\n1. Вычислите: log₂32 + √81.\n2. Решите уравнение 2x² − 5x − 3 = 0.\n3. Найдите наибольшее значение y = −x² + 8x − 7.\nОбязательно поясните ход решения в развёрнутых заданиях.",
  ];
  db.assignments = titles.map((title, i) => ({
    id: `assignment-${i + 1}`,
    title,
    description: descriptions[i % 3],
    subject: "Математика",
    deadline: date([1, 2, 4, -1, -7, -14, -21, -28][i], 23),
    createdAt: date([-5, -6, -7, -8, -14, -21, -28, -35][i]),
    studentIds:
      i === 1
        ? db.groups[0].studentIds
        : db.users.filter((u) => u.role === "student").map((u) => u.id),
    fileIds: [],
    maxScore: i === 2 ? 32 : 10,
    questions: [8, 6, 19, 7, 5, 6, 8, 6][i],
    archived: false,
  }));
  db.submissions = [];
  const pending = [
    ["student-1", "assignment-1"],
    ["student-2", "assignment-2"],
    ["student-3", "assignment-1"],
    ["student-5", "assignment-3"],
  ];
  pending.forEach(([studentId, assignmentId], i) =>
    db.submissions.push({
      id: `submission-p${i}`,
      assignmentId,
      studentId,
      answers: [
        "1. 12x³ − 4x\n2. x = −2, x = 2\n3. Наименьшее значение равно −4 при x = 3.\n\nПроизводная y′ = 2x − 6 обращается в ноль при x = 3. Сравниваем значения функции в концах отрезка и в критической точке.",
        "1. 62°\n2. AC = 12\n3. Соединим точку касания с центром окружности. Радиус перпендикулярен касательной. Из прямоугольного треугольника получаем требуемое равенство.",
      ][i % 2],
      fileIds: [],
      submittedAt: new Date(now.getTime() - (i + 2) * 3600000).toISOString(),
      status: "pending",
      reviewFileIds: [],
    }),
  );
  for (let a = 3; a < 8; a++) {
    for (let s = 1; s <= 8; s++) {
      if (a === 3 && s > 4) continue;
      const score = Math.min(10, Math.max(4, 12 - a + ((s + 1) % 3)));
      const sub: Submission = {
        id: `submission-${a}-${s}`,
        assignmentId: `assignment-${a + 1}`,
        studentId: `student-${s}`,
        answers: "1. 14\n2. −0,5; 3\n3. 9\nРешения проверены на занятии.",
        fileIds: [],
        submittedAt: date(-((a - 3) * 7) - 2),
        status: "reviewed",
        score,
        feedback:
          score >= 9
            ? "Отличная работа! Решения последовательные, обоснования точные. Продолжай в том же духе."
            : "Хорошая работа! Обрати внимание на область допустимых значений и проверку корней. На следующем занятии разберём эти шаги подробнее.",
        reviewFileIds: [],
        reviewedAt: date(-((a - 3) * 7) - 1),
      };
      db.submissions.push(sub);
    }
  }
  db.lessons = [
    {
      id: "lesson-1",
      title: "Производная. Практика",
      groupId: "group-1",
      startsAt: date(0, 16),
      duration: 90,
      location: "Онлайн · учебная комната",
    },
    {
      id: "lesson-2",
      title: "Разбор пробного варианта",
      groupId: "group-2",
      startsAt: date(0, 18),
      duration: 90,
      location: "Онлайн · учебная комната",
    },
    {
      id: "lesson-3",
      title: "Сложные задачи второй части",
      groupId: "group-3",
      startsAt: date(1, 17),
      duration: 60,
      location: "Онлайн · учебная комната",
    },
    {
      id: "lesson-4",
      title: "Геометрия. Окружность",
      groupId: "group-1",
      startsAt: date(2, 16),
      duration: 90,
      location: "Онлайн · учебная комната",
    },
    {
      id: "lesson-5",
      title: "Теория вероятностей",
      groupId: "group-2",
      startsAt: date(3, 18),
      duration: 90,
      location: "Онлайн · учебная комната",
    },
  ];
  return db;
}
