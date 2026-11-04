SELECT s.id AS sessionid,s.userid,s.timecreated,s.timemodified,g.generation,a.revision,e.timeend,
 (SELECT count(*) FROM public.PREFIXcourse_modules_completion x WHERE x.coursemoduleid=m.id AND x.userid=u.id) AS completionrows,
 (SELECT min(x.completionstate) FROM public.PREFIXcourse_modules_completion x WHERE x.coursemoduleid=m.id AND x.userid=u.id) AS completionstate
FROM public.PREFIXsessions s
JOIN clear_probe.generations g ON g.sessionid=s.id
CROSS JOIN clear_probe.authority a
JOIN public.PREFIXuser u ON u.id=s.userid
JOIN public.PREFIXuser_enrolments e ON e.userid=u.id
JOIN public.PREFIXenrol en ON en.id=e.enrolid
JOIN public.PREFIXcourse c ON c.id=en.courseid
JOIN public.PREFIXcourse_categories cat ON cat.id=c.category
JOIN public.PREFIXcourse_modules m ON m.course=c.id
JOIN public.PREFIXmodules md ON md.id=m.module
JOIN public.PREFIXpage p ON p.id=m.instance AND p.course=c.id
JOIN public.PREFIXcourse_sections sec ON sec.id=m.section AND sec.course=c.id
WHERE s.id=$1 AND u.id=$2 AND c.id=$3 AND m.id=$4 AND a.id=1
AND u.auth='manual' AND u.confirmed=1 AND u.deleted=0 AND u.suspended=0
AND u.firstname<>'' AND u.lastname<>'' AND u.email<>''
AND NOT EXISTS(SELECT 1 FROM public.PREFIXuser_preferences pr WHERE pr.userid=u.id AND pr.name='auth_forcepasswordchange' AND pr.value NOT IN ('','0'))
AND NOT EXISTS(SELECT 1 FROM public.PREFIXuser_info_field)
AND NOT EXISTS(SELECT 1 FROM public.PREFIXuser_info_data)
AND e.status=0 AND en.status=0 AND en.enrol='manual' AND e.timestart<=$5 AND (e.timeend=0 OR e.timeend>$5)
AND (SELECT count(*) FROM public.PREFIXuser_enrolments ue JOIN public.PREFIXenrol ep ON ep.id=ue.enrolid WHERE ue.userid=u.id AND ep.courseid=c.id)=1
AND c.visible=1 AND c.enablecompletion=1 AND c.format='topics' AND c.groupmode=0 AND c.defaultgroupingid=0
AND cat.visible=1 AND NOT EXISTS(SELECT 1 FROM public.PREFIXcourse_categories ac WHERE ac.id=ANY(string_to_array(trim(leading '/' FROM cat.path),'/')::bigint[]) AND ac.visible<>1)
AND (SELECT count(*) FROM public.PREFIXcourse_categories ac WHERE ac.id=ANY(string_to_array(trim(leading '/' FROM cat.path),'/')::bigint[]))=cardinality(string_to_array(trim(leading '/' FROM cat.path),'/'))
AND md.name='page' AND m.visible=1 AND m.visibleoncoursepage=1 AND m.deletioninprogress=0
AND (m.availability IS NULL OR m.availability='') AND (sec.availability IS NULL OR sec.availability='')
AND sec.visible=1 AND m.groupmode=0 AND m.groupingid=0 AND m.completion=1 AND m.completiongradeitemnumber IS NULL
