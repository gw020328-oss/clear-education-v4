// Host-owned synthetic configuration, separate from operator source drafts.
import { exampleDraft } from '../m1/examples.mjs';
export function studentHttpExamplePolicies(revision=1){
 const draft=exampleDraft('third');draft.policyVersion='student-third-demo.'+revision;
 return [{policyId:'student-third-demo',revision,draft,sources:structuredClone(draft.sources),capabilities:structuredClone(draft.capabilities)}];
}
