SELECT a.revision, g.generation, s.id AS session_id, s.userid, s.timecreated, s.timemodified,
       p.installation_epoch, p.approved_hash,
       (SELECT count(*) FROM clear_source.completion x WHERE x.userid=s.userid AND x.moduleid=m.moduleid) AS completion_rows,
       (SELECT min(x.completionstate) FROM clear_source.completion x WHERE x.userid=s.userid AND x.moduleid=m.moduleid) AS completion_state,
       e.timeend
FROM clear_source.sessions s
JOIN clear_guard.session_generations g ON g.session_id=s.id
CROSS JOIN clear_guard.authority a
CROSS JOIN clear_source.profile p
JOIN clear_source.users u ON u.id=s.userid
JOIN clear_source.enrolments e ON e.userid=u.id AND e.courseid=$2
JOIN clear_source.course_gate c ON c.courseid=e.courseid
JOIN clear_source.page_gate m ON m.courseid=c.courseid AND m.moduleid=$3
WHERE s.id=$1 AND a.id=1 AND p.id=1
AND u.auth='manual' AND NOT u.suspended AND NOT u.deleted AND NOT u.guest AND NOT u.admin
AND NOT u.forcepasswordchange AND u.fullysetup
AND e.method='manual' AND e.active AND e.timestart<=$4 AND (e.timeend=0 OR e.timeend>$4)
AND c.acl_hash=$5 AND c.visible AND c.ancestors_visible AND c.unrestricted
AND m.module_type='page' AND m.visible AND m.section_visible AND NOT m.deletioninprogress
AND m.availability='' AND m.groupmode=0 AND m.groupingid=0 AND NOT m.stealth AND m.completion=1
