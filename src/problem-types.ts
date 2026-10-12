export const ProblemType = {
  SingleChoice: 1,
  MultipleChoice: 2,
  Poll: 3,
  FillBlank: 4,
  ShortAnswer: 5,
  Judgement: 6,
} as const;

export function isShortAnswerProblem(problemType: number): boolean {
  return problemType === ProblemType.ShortAnswer;
}

export function getProblemTypeName(type: number): string {
  switch (type) {
    case ProblemType.SingleChoice:
      return "Single choice";
    case ProblemType.MultipleChoice:
      return "Multiple choice";
    case ProblemType.Poll:
      return "Poll";
    case ProblemType.FillBlank:
      return "Fill in the blank";
    case ProblemType.ShortAnswer:
      return "Short answer";
    case ProblemType.Judgement:
      return "True or false";
    default:
      return "Unknown";
  }
}

export function getProblemTypeLabel(type: number): string {
  switch (type) {
    case ProblemType.SingleChoice:
      return "单选题";
    case ProblemType.MultipleChoice:
      return "多选题";
    case ProblemType.Poll:
      return "投票题";
    case ProblemType.FillBlank:
      return "填空题";
    case ProblemType.ShortAnswer:
      return "主观题";
    case ProblemType.Judgement:
      return "判断题";
    default:
      return "其他题型";
  }
}
