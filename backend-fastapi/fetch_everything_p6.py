import asyncio
import os
import sys
import json
import httpx
from dotenv import load_dotenv

# Ensure we can import app modules
sys.path.append(os.getcwd())

from app.services.p6_token_service import get_valid_p6_token, get_http_client
from app.config import settings

async def fetch_everything_for_activity(project_oid, activity_id_str):
    load_dotenv()
    token = await get_valid_p6_token()
    base_url = "https://sin1.p6.oraclecloud.com/adani/p6ws/restapi"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    print(f"--- Fetching ALL data for Project OID: {project_oid}, Activity ID: {activity_id_str} ---")
    
    async with get_http_client(timeout=60.0) as client:
        # 1. Fetch Activity with nearly all fields from user's list
        activity_fields = (
            "AccountingVariance,AccountingVarianceLaborUnits,ActivityOwnerUserId,ActualDuration,ActualExpenseCost,"
            "ActualFinishDate,ActualLaborCost,ActualLaborUnits,ActualMaterialCost,ActualNonLaborCost,ActualNonLaborUnits,"
            "ActualStartDate,ActualThisPeriodLaborCost,ActualThisPeriodLaborUnits,ActualThisPeriodMaterialCost,"
            "ActualThisPeriodNonLaborCost,ActualThisPeriodNonLaborUnits,ActualTotalCost,ActualTotalUnits,AtCompletionDuration,"
            "AtCompletionExpenseCost,AtCompletionLaborCost,AtCompletionLaborUnits,AtCompletionLaborUnitsVariance,"
            "AtCompletionMaterialCost,AtCompletionNonLaborCost,AtCompletionNonLaborUnits,AtCompletionTotalCost,AtCompletionTotalUnits,"
            "AtCompletionVariance,AutoComputeActuals,Baseline1Duration,Baseline1FinishDate,Baseline1PlannedDuration,"
            "Baseline1PlannedExpenseCost,Baseline1PlannedLaborCost,Baseline1PlannedLaborUnits,Baseline1PlannedMaterialCost,"
            "Baseline1PlannedNonLaborCost,Baseline1PlannedNonLaborUnits,Baseline1PlannedTotalCost,Baseline1StartDate,"
            "Baseline2Duration,Baseline2FinishDate,Baseline2PlannedDuration,Baseline2PlannedExpenseCost,Baseline2PlannedLaborCost,"
            "Baseline2PlannedLaborUnits,Baseline2PlannedMaterialCost,Baseline2PlannedNonLaborCost,Baseline2PlannedNonLaborUnits,"
            "Baseline2PlannedTotalCost,Baseline2StartDate,Baseline3Duration,Baseline3FinishDate,Baseline3PlannedDuration,"
            "Baseline3PlannedExpenseCost,Baseline3PlannedLaborCost,Baseline3PlannedLaborUnits,Baseline3PlannedMaterialCost,"
            "Baseline3PlannedNonLaborCost,Baseline3PlannedNonLaborUnits,Baseline3PlannedTotalCost,Baseline3StartDate,"
            "BaselineDuration,BaselineFinishDate,BaselinePlannedDuration,BaselinePlannedExpenseCost,BaselinePlannedLaborCost,"
            "BaselinePlannedLaborUnits,BaselinePlannedMaterialCost,BaselinePlannedNonLaborCost,BaselinePlannedNonLaborUnits,"
            "BaselinePlannedTotalCost,BaselineStartDate,BudgetAtCompletion,CalendarName,CalendarObjectId,CostPercentComplete,"
            "CostPercentOfPlanned,CostPerformanceIndex,CostPerformanceIndexLaborUnits,CostVariance,CostVarianceIndex,"
            "CostVarianceIndexLaborUnits,CostVarianceLaborUnits,CreateDate,CreateUser,DataDate,Duration1Variance,Duration2Variance,"
            "Duration3Variance,DurationPercentComplete,DurationPercentOfPlanned,DurationType,DurationVariance,EarlyFinishDate,"
            "EarlyStartDate,EarnedValueCost,EarnedValueLaborUnits,EstimateAtCompletionCost,EstimateAtCompletionLaborUnits,"
            "EstimateToComplete,EstimateToCompleteLaborUnits,EstimatedWeight,ExpectedFinishDate,ExpenseCost1Variance,"
            "ExpenseCost2Variance,ExpenseCost3Variance,ExpenseCostPercentComplete,ExpenseCostVariance,ExternalEarlyStartDate,"
            "ExternalLateFinishDate,FinishDate,FinishDate1Variance,FinishDate2Variance,"
            "FinishDate3Variance,FinishDateVariance,FloatPath,FloatPathOrder,FreeFloat,GUID,HasFutureBucketData,Id,IsBaseline,"
            "IsCritical,IsLongestPath,IsNewFeedback,IsStarred,IsTemplate,IsWorkPackage,LaborCost1Variance,LaborCost2Variance,"
            "LaborCost3Variance,LaborCostPercentComplete,LaborCostVariance,LaborUnits1Variance,LaborUnits2Variance,"
            "LaborUnits3Variance,LaborUnitsPercentComplete,LaborUnitsVariance,LastUpdateDate,LastUpdateUser,LateFinishDate,"
            "LateStartDate,LevelingPriority,LocationName,LocationObjectId,MaterialCost1Variance,MaterialCost2Variance,"
            "MaterialCost3Variance,MaterialCostPercentComplete,MaterialCostVariance,MaximumDuration,MinimumDuration,"
            "MostLikelyDuration,Name,NonLaborCost1Variance,NonLaborCost2Variance,NonLaborCost3Variance,NonLaborCostPercentComplete,"
            "NonLaborCostVariance,NonLaborUnits1Variance,NonLaborUnits2Variance,NonLaborUnits3Variance,NonLaborUnitsPercentComplete,"
            "NonLaborUnitsVariance,ObjectId,PercentComplete,PercentCompleteType,PerformancePercentComplete,"
            "PerformancePercentCompleteByLaborUnits,PhysicalPercentComplete,PlannedDuration,PlannedExpenseCost,PlannedFinishDate,"
            "PlannedLaborCost,PlannedLaborUnits,PlannedMaterialCost,PlannedNonLaborCost,PlannedNonLaborUnits,PlannedStartDate,"
            "PlannedTotalCost,PlannedTotalUnits,PlannedValueCost,PlannedValueLaborUnits,PostRespCriticalityIndex,"
            "PostResponsePessimisticFinish,PostResponsePessimisticStart,PreRespCriticalityIndex,PreResponsePessimisticFinish,"
            "PreResponsePessimisticStart,PrimaryConstraintDate,PrimaryConstraintType,PrimaryResourceId,PrimaryResourceName,"
            "PrimaryResourceObjectId,ProjectId,ProjectName,ProjectObjectId,RemainingDuration,RemainingEarlyFinishDate,"
            "RemainingEarlyStartDate,RemainingExpenseCost,RemainingFloat,RemainingLaborCost,RemainingLaborUnits,"
            "RemainingLateFinishDate,RemainingLateStartDate,RemainingMaterialCost,RemainingNonLaborCost,RemainingNonLaborUnits,"
            "RemainingTotalCost,RemainingTotalUnits,ResumeDate,ReviewFinishDate,ReviewRequired,ReviewStatus,SchedulePercentComplete,"
            "SchedulePerformanceIndex,SchedulePerformanceIndexLaborUnits,ScheduleVariance,ScheduleVarianceIndex,"
            "ScheduleVarianceIndexLaborUnits,ScheduleVarianceLaborUnits,ScopePercentComplete,SecondaryConstraintDate,"
            "SecondaryConstraintType,StartDate,StartDate1Variance,StartDate2Variance,StartDate3Variance,StartDateVariance,Status,"
            "StatusCode,SuspendDate,ToCompletePerformanceIndex,TotalCost1Variance,"
            "TotalCost2Variance,TotalCost3Variance,TotalCostVariance,TotalFloat,Type,UnitsPercentComplete,UnreadCommentCount,"
            "WBSCode,WBSName,WBSNamePath,WBSObjectId,WBSPath,WorkPackageId,WorkPackageName"
        )
        
        filter_str = f"ProjectObjectId={project_oid} AND Id='{activity_id_str}'"
        url = f"{base_url}/activity?Filter={filter_str}&Fields={activity_fields}"
        resp = await client.get(url, headers=headers)
        
        if resp.status_code != 200:
            print(f"Error fetching activity fields. HTTP {resp.status_code}:\n{resp.text}")
            # Try to identify problematic field if 400
            if resp.status_code == 400:
                print("Note: Some fields may not be supported by this P6 version.")
            return

        activities = resp.json()
        if not activities:
            print("Activity not found in P6.")
            return
            
        activity = activities[0]
        activity_oid = activity["ObjectId"]

        # 2. Resource Assignments with user's fields
        ra_fields = (
            "ActivityActualFinish,ActivityId,ActivityName,ActivityObjectId,ActivityType,ActualCost,ActualCurve,ActualDuration,"
            "ActualFinishDate,ActualOvertimeCost,ActualOvertimeUnits,ActualRegularCost,ActualRegularUnits,ActualStartDate,"
            "ActualThisPeriodCost,ActualThisPeriodUnits,ActualUnits,AssignmentPercentComplete,AtCompletionCost,AtCompletionDuration,"
            "AtCompletionUnits,AutoComputeActuals,BudgetAtCompletionCosts,BudgetAtCompletionUnits,CalendarName,CalendarObjectId,"
            "CostAccountId,CostAccountName,CostAccountObjectId,CreateDate,CreateUser,DrivingActivityDatesFlag,DurationPercentComplete,"
            "EstimateToCompletionCosts,EstimateToCompletionUnits,FinancialPeriodTmplId,FinishDate,GUID,HasFutureBucketData,IsActive,"
            "IsActivityFlagged,IsBaseline,IsCostUnitsLinked,IsOvertimeAllowed,IsPrimaryResource,IsTemplate,LastUpdateDate,"
            "LastUpdateUser,ObjectId,OvertimeFactor,PendingActualOvertimeUnits,PendingActualRegularUnits,PendingPercentComplete,"
            "PendingRemainingUnits,PercentComplete,PercentCompleteType,PlannedCost,PlannedCurve,PlannedDuration,PlannedFinishDate,"
            "PlannedLag,PlannedStartDate,PlannedUnits,PlannedUnitsPerTime,PricePerUnit,PriorActualOvertimeUnits,PriorActualRegularUnits,"
            "Proficiency,ProjectId,ProjectName,ProjectObjectId,RateSource,RateType,RemainingCost,RemainingCurve,RemainingDuration,"
            "RemainingFinishDate,RemainingLag,RemainingLateFinishDate,RemainingLateStartDate,RemainingStartDate,RemainingUnits,"
            "RemainingUnitsPerTime,ResourceCalendarName,ResourceCurveName,ResourceCurveObjectId,ResourceId,ResourceName,ResourceObjectId,"
            "ResourceType,ReviewRequired,RoleId,RoleName,RoleObjectId,RoleShortName,StaffedRemainingCost,StaffedRemainingUnits,"
            "StartDate,StatusCode,TotalPastPeriodCost,TotalPastPeriodUnits,UnitsPercentComplete,UnreadCommentCount,UnstaffedRemainingCost,"
            "UnstaffedRemainingUnits,WBSObjectId,WBSNamePath"
        )
        ra_url = f"{base_url}/resourceAssignment?Filter=ActivityObjectId={activity_oid}&Fields={ra_fields}"
        ra_resp = await client.get(ra_url, headers=headers)
        ras = ra_resp.json() if ra_resp.status_code == 200 else []

        # 3. Project details
        proj_fields = (
            "ActivityDefaultActivityType,ActivityDefaultCalendarName,ActivityDefaultCalendarObjectId,ActivityDefaultCostAccountObjectId,"
            "ActivityDefaultDurationType,ActivityDefaultPercentCompleteType,ActivityDefaultPricePerUnit,ActivityDefaultReviewRequired,"
            "ActivityIdBasedOnSelectedActivity,ActivityIdIncrement,ActivityIdPrefix,ActivityIdSuffix,ActivityPercentCompleteBasedOnActivitySteps,"
            "AddActualToRemaining,AddedBy,AllowNegativeActualUnitsFlag,AllowStatusReview,AnnualDiscountRate,AnticipatedFinishDate,"
            "AnticipatedStartDate,AssignmentDefaultDrivingFlag,AssignmentDefaultRateType,CalculateFloatBasedOnFinishDate,CheckOutDate,"
            "CheckOutStatus,CheckOutUserObjectId,ComputeTotalFloatType,ContainsSummaryData,ContractManagementGroupName,"
            "ContractManagementProjectName,CostQuantityRecalculateFlag,CreateDate,CreateUser,CriticalActivityFloatLimit,"
            "CriticalActivityFloatThreshold,CriticalActivityPathType,CriticalFloatThreshold,CurrentBaselineProjectObjectId,CurrentBudget,"
            "CurrentVariance,DataDate,DateAdded,DefaultPriceTimeUnits,Description,DiscountApplicationPeriod,DistributedCurrentBudget,"
            "EarnedValueComputeType,EarnedValueETCComputeType,EarnedValueETCUserValue,EarnedValueUserPercent,EnablePrimeSycFlag,"
            "EnablePublication,EnableSummarization,EtlInterval,ExternalCRKey,FinancialPeriodTemplateId,FinishDate,FiscalYearStartMonth,"
            "ForecastFinishDate,ForecastStartDate,GUID,HasFutureBucketData,HistoryInterval,HistoryLevel,Id,IgnoreOtherProjectRelationships,"
            "IndependentETCLaborUnits,IndependentETCTotalCost,IntegratedType,IntegratedWBS,IsTemplate,LastApplyActualsDate,"
            "LastFinancialPeriodObjectId,LastLevelDate,LastPublishedOn,LastScheduleDate,LastSummarizedDate,LastUpdateDate,LastUpdateUser,"
            "Latitude,LevelAllResources,LevelDateFlag,LevelFloatThresholdCount,LevelOuterAssign,LevelOuterAssignPriority,LevelOverAllocationPercent,"
            "LevelPriorityList,LevelResourceList,LevelWithinFloat,LevelingPriority,LimitMultipleFloatPaths,LinkActualToActualThisPeriod,"
            "LinkPercentCompleteWithActual,LinkPlannedAndAtCompletionFlag,LocationName,LocationObjectId,Longitude,MakeOpenEndedActivitiesCritical,"
            "MaximumMultipleFloatPaths,MultipleFloatPathsEnabled,MultipleFloatPathsEndingActivityObjectId,MultipleFloatPathsUseTotalFloat,"
            "MustFinishByDate,Name,NetPresentValue,OBSName,OBSObjectId,ObjectId,OriginalBudget,OutOfSequenceScheduleType,OverallProjectScore,"
            "OwnerResourceObjectId,ParentEPSId,ParentEPSName,ParentEPSObjectId,PaybackPeriod,PerformancePercentCompleteByLaborUnits,"
            "PlannedStartDate,PostResponsePessimisticFinish,PostResponsePessimisticStart,PreResponsePessimisticFinish,PreResponsePessimisticStart,"
            "PricePerUnit,PrimaryResourcesCanMarkActivitiesAsCompleted,PrimaryResourcesCanUpdateActivityDates,ProjectForecastStartDate,"
            "ProjectScheduleType,PropertyType,ProposedBudget,PublicationPriority,PublishLevel,RelationshipLagCalendar,ResetPlannedToRemainingFlag,"
            "ResourceCanBeAssignedToSameActivityMoreThanOnce,ResourceName,ResourcesCanAssignThemselvesToActivities,"
            "ResourcesCanAssignThemselvesToActivitiesOutsideOBSAccess,ResourcesCanEditAssignmentPercentComplete,"
            "ResourcesCanMarkAssignmentAsCompleted,ResourcesCanStaffRoleAssignment,ResourcesCanViewInactiveActivities,ReturnOnInvestment,"
            "ReviewType,RiskExposure,RiskLevel,RiskMatrixName,RiskMatrixObjectId,RiskScore,ScheduleWBSHierarchyType,ScheduledFinishDate,"
            "SourceProjectObjectId,StartDate,StartToStartLagCalculationType,Status,StatusReviewerName,StatusReviewerObjectId,"
            "StrategicPriority,SummarizeResourcesRolesByWBS,SummarizeToWBSLevel,SummarizedDataDate"
        )
        proj_url = f"{base_url}/project?Filter=ObjectId={project_oid}&Fields={proj_fields}"
        proj_resp = await client.get(proj_url, headers=headers)
        proj_data = proj_resp.json() if proj_resp.status_code == 200 else []
        proj = proj_data[0] if proj_data else {}

        # 4. Activity Expenses
        exp_fields = "AccrualType,ActivityId,ActivityName,ActivityObjectId,ActualCost,ActualUnits,AtCompletionCost,AtCompletionUnits,AutoComputeActuals,CBSCode,CBSId,CostAccountId,CostAccountName,CostAccountObjectId,CreateDate,CreateUser,DocumentNumber,ExpenseCategoryName,ExpenseCategoryObjectId,ExpenseDescription,ExpenseItem,ExpensePercentComplete,IsBaseline,IsTemplate,LastUpdateDate,LastUpdateUser,ObjectId,OverBudget,PlannedCost,PlannedUnits,PricePerUnit,ProjectId,ProjectObjectId,RemainingCost,RemainingUnits,UnitOfMeasure,Vendor,WBSObjectId"
        exp_url = f"{base_url}/activityExpense?Filter=ActivityObjectId={activity_oid}&Fields={exp_fields}"
        exp_resp = await client.get(exp_url, headers=headers)
        exps = exp_resp.json() if exp_resp.status_code == 200 else []

        # Assemble and write to file
        final_result = {
            "Activity": [activity],
            "ResourceAssignment": ras,
            "ActivityExpense": exps,
            "Project": proj
        }
        
        with open("full_p6_data.json", "w", encoding="utf-8") as f:
            json.dump(final_result, f, indent=2)
            
        print("OK: Data written to full_p6_data.json")

if __name__ == "__main__":
    p_oid = int(sys.argv[1]) if len(sys.argv) > 1 else 6642
    a_id = sys.argv[2] if len(sys.argv) > 2 else "ACL1-CC-1000"
    asyncio.run(fetch_everything_for_activity(p_oid, a_id))