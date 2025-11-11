/**
 * `{"op":"hello","userid":"123456","role":"student","auth":"xxxxxx","lessonid":"123456789"}`
 */
export const S_HELLO = "hello";

/**
 * `{"op":"hello","lessonid":"123456789","livestatus":0,"livevoice":0,"timeline":[...],"addinversion":5.5,"interactive":false,"danmu":false}`
 */
export const R_HELLO = "hello";

/**
 * `{"op":"presentationcreated","lessonid":"123456789","presentation":"123456789"}`
 */
export const R_PRESENTATION_CREATED = "presentationcreated";

/**
 * `{"op":"presentationupdated","lessonid":"123456789","presentation":"123456789"}`
 */
export const S_PRESENTATION_UPDATED = "presentationupdated";

/**
 * `{"op":"showpresentation","lessonid":"123456789","presentation":"123456789","dt":1777777777777,"timeline":[...],"unlockedproblem":[],"slideindex":2,"slideid":"123456789","shownow":true,"danmu":false}`
 */
export const R_SHOW_PRESENTATION = "showpresentation";

/**
 * `{"op":"showfinished","lessonid":"123456789","presentation":"123456789","event":{"type":"event","title":"幻灯片 幻灯片名 结束放映","code":"SHOW_FINISH","replace":["幻灯片名"],"show":true,"dt":1777777777780}}`
 */
export const S_SHOW_FINISHED = "showfinished";
/**
 * `{"op":"fetchtimeline","lessonid":"123456789","msgid":1}`
 */
export const S_FETCH_TIMELINE = "fetchtimeline";

/**
 * `{"op":"fetchtimeline","msgid":1,"lessonid":"123456789","timeline":[{"type":"event","title":"上课啦！","code":"LESSON_START","show":true,"dt":1777777777777},{"type":"event","title":"随机点名选中：姓名 学号","code":"RANDOM_PICK","replace":["姓名","学号"],"show":true,"dt":1777777777778}],"presentation":"123456789","slideindex":0,"slideid":0,"danmu":false,"unlockedproblem":[]}`
 */
export const R_FETCH_TIMELINE = "fetchtimeline";

/**
 * `{"op":"slidenav","lessonid":"123456789","unlockedproblem":[],"danmu":false,"shownow":true,"to":"student","slide":{"type":"slide","pres":"123456789","si":3,"sid":"123456789","step":-1,"total":0,"dt":1777777777779},"im":false}`
 */
export const R_SLIDE_NAV = "slidenav";

/**
 * `{"op":"unlockproblem","lessonid":"123456789","problem":{"type":"problem","prob":"123456789","pres":"123456789","si":1,"sid":"123456789","dt":1777777777779,"limit":-1},"unlockedproblem":["123456789"]}`
 */
export const R_UNLOCK_PROBLEM = "unlockproblem";

/**
 * `{"op":"probleminfo","lessonid":"123456789","problemid":"123456789","msgid":1}`
 */
export const S_PROBLEM_INFO = "probleminfo";

/**
 * `{"op":"probleminfo","msgid":1,"lessonid":"123456789","problemid":"123456789","dt":1777777777779,"limit":-1,"now":1777777777779}`
 */
export const R_PROBLEM_INFO = "probleminfo";

/**
 * `{"op":"problemfinished","lessonid":"123456789","prob":"123456789","pres":"123456789","sid":"123456789","dt":1777777777779,"problem":{"type":"problem","prob":"123456789","pres":"123456789","si":null,"sid":"123456789","dt":1777777777779,"limit":0}}`
 */
export const R_PROBLEM_FINISHED = "problemfinished";

/**
 * `{"op":"extendtime","lessonid":"123456789","problem":{"type":"problem","prob":"123456789","pres":"123456789","si":null,"sid":"123456789","dt":1777777777779,"limit":47,"extend":30,"now":1777777777779}}`
 */
export const R_EXTEND_TIME = "extendtime";
