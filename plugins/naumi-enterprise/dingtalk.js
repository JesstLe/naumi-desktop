import {fileURLToPath} from 'node:url';
import * as filesystemSkills from '@deepseek-ai/dsh-skill-filesystem';

export function installDingTalk(ctx){
  return ctx.inject(['skills'],scope=>filesystemSkills.apply(scope,{providerName:'naumi-dingtalk',includeDefaultRoots:false,watch:false,customSkillDirs:[],bundledSkillDir:fileURLToPath(new URL('./dingtalk-skills',import.meta.url))}));
}
