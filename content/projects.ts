export type Project = {
  title: string;
  summary: string;
  year?: string;
  url?: string;
  tags?: string[];
  featured?: boolean;
};

export const projects: Project[] = [
  {
    title: "Lecture Summarizer",
    summary: "End-to-end pipeline that transcribes lecture audio (Whisper), summarizes with GPT, and auto-publishes structured notes to Notion.",
    url: "https://github.com/Itakello/Lecture_summarizer",
    tags: ["Python", "OpenAI", "Whisper", "Notion", "Summarization"],
    featured: true,
    year: "2024",
  },
  {
    title: "Co-voyager (fork)",
    summary: "Fork of MineDojo/Voyager adding cooperative task decomposition, human/AI collaboration, and multi-agent planning in Minecraft.",
    url: "https://github.com/Itakello/Co-voyager",
    tags: ["LLMs", "Agents", "Minecraft", "Multi-agent", "JavaScript"],
    featured: true,
    year: "2024",
  },
  {
    title: "Plantalot",
    summary: "Android app to design and maintain a home vegetable garden: crop catalog, garden layout, and companion-planting suggestions.",
    url: "https://github.com/Itakello/Plantalot",
    tags: ["Android", "Java", "UI/UX", "Firebase"],
    featured: true,
    year: "2023",
  },
  {
    title: "Competitive Programming (archive)",
    summary: "C++ solutions and reusable templates (Fenwick tree, segment tree, etc.) organized by topic.",
    url: "https://github.com/Itakello/Competitive-programming",
    tags: ["C++", "Algorithms", "Data Structures", "Templates"],
    year: "2023",
  },
  {
    title: "Academic Repository",
    summary: "Master's coursework portfolio: reports, slides, papers, and thesis, organized by date and subject.",
    url: "https://github.com/Itakello/Academic-Repository",
    tags: ["University", "Reports", "Presentations", "Thesis", "Research"]
  }
];
